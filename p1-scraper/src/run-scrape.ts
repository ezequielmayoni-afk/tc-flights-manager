// Entrypoint that wires the whole Phase 1 pipeline together: discover F1 events
// from the listing, resolve each (eventUuid, categoryUuid) pair, fetch the API,
// normalize, then either persist (real run) or print (`--dry`). It enforces
// per-event error tolerance (SCRAPE-06), the dry-mode contract (OPS-03), and the
// RUN-LEVEL availability sweep (DATA-04) that deactivates events which vanished
// entirely from the listing — without ever deleting rows.

import { scrapeListing } from './p1/listing.js'
import { resolveUuid } from './p1/resolveUuid.js'
import { getEvent } from './p1/api.js'
import { normalizeEvent, enrichEventImages } from './p1/normalize.js'
import { persistEvent, dryPrintEvent } from './persist.js'
import { mirrorEventImages } from './images.js'
import { supabase } from './supabase.js'

const dry = process.argv.includes('--dry')

async function main() {
  console.log('[run] mode=' + (dry ? 'dry' : 'real'))

  const events = await scrapeListing()
  console.log('[run] discovered ' + events.length + ' F1 events')

  let ok = 0
  let skipped = 0
  const seenUuids = new Set<string>()

  for (const listingEvent of events) {
    try {
      const pair = await resolveUuid(listingEvent.url)
      if (!pair) {
        // resolveUuid already warned (no checkout link / fetch error).
        skipped++
        continue
      }

      const data = await getEvent(pair.eventUuid, pair.categoryUuid)

      const normalized = normalizeEvent(data, {
        eventUuid: pair.eventUuid,
        sourceUrl: listingEvent.url,
        slug: listingEvent.slug,
      })
      if (!normalized) {
        // normalizeEvent already warned on top-level failure.
        skipped++
        continue
      }

      // Enrich with seat-view photos + GP banner parsed from the detail HTML
      // that resolveUuid already fetched (no extra request).
      enrichEventImages(normalized, pair.html)

      // Only count an event as "seen" once it normalized successfully.
      seenUuids.add(pair.eventUuid)

      if (dry) {
        await dryPrintEvent(normalized)
      } else {
        await persistEvent(normalized)
        await mirrorEventImages(normalized)
      }
      ok++
    } catch (err) {
      // SCRAPE-06: one bad event never aborts the run.
      console.warn('[run] skipping ' + listingEvent.url + ': ' + String(err))
      skipped++
    }
  }

  // RUN-LEVEL availability sweep (DATA-04): events that vanished from the listing
  // entirely were never re-fetched this run, so persistEvent never touched them.
  // Deactivate the events NOT in seenUuids and mark their tickets unavailable.
  // Skip in dry mode (no DB writes) and when nothing was seen (a failed run must
  // not deactivate everything). Never delete rows.
  if (!dry && seenUuids.size > 0) {
    const seenList = '(' + [...seenUuids].map((u) => '"' + u + '"').join(',') + ')'

    const { error: eventsError } = await supabase
      .from('p1_events')
      .update({ active: false, updated_at: new Date().toISOString() })
      .not('event_uuid', 'in', seenList)
    if (eventsError) {
      console.warn('[run] run-level event sweep failed: ' + eventsError.message)
    }

    const { data: gone, error: goneError } = await supabase
      .from('p1_events')
      .select('id')
      .eq('active', false)
    if (goneError) {
      console.warn('[run] run-level sweep (fetch inactive) failed: ' + goneError.message)
    } else if (gone?.length) {
      const { error: ticketsError } = await supabase
        .from('p1_tickets')
        .update({ availability: 'unavailable', updated_at: new Date().toISOString() })
        .in(
          'event_id',
          gone.map((g) => g.id)
        )
      if (ticketsError) {
        console.warn('[run] run-level ticket sweep failed: ' + ticketsError.message)
      }
    }

    console.log('[run] run-level sweep: deactivated events not seen this run')
  }

  console.log(
    '[run] done — ok=' + ok + ' skipped=' + skipped + (dry ? ' (no DB writes)' : '')
  )
}

main().catch((err) => {
  console.error('[run] fatal', err)
  process.exit(1)
})
