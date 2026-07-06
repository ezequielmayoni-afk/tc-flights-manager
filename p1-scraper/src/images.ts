// Mirror every event main image and ticket seatplan image into the Supabase
// Storage bucket `p1-images`, recording the deterministic storage path alongside
// the original URL in the DB. TravelCompositor (Phase 3) needs stable image URLs
// we own, not p1travel's S3 URLs that may rotate. Per-image tolerance: any single
// fetch/upload/update failure warns and continues — one bad image never aborts the
// event, and one bad event never aborts the run (IMG-01, IMG-02, SCRAPE-06).

import { supabase } from './supabase.js'
import { THROTTLE_MS, BROWSER_UA } from './config.js'
import type { NormalizedEvent } from './p1/normalize.js'

const BUCKET = 'p1-images'

// Module-level guard so ensureBucket only runs once per process.
let bucketEnsured = false

/**
 * Idempotently ensure the public bucket exists. An "already exists" / 409 /
 * "Duplicate" error is treated as success. Any other error warns and returns
 * (does NOT throw) — if the bucket was created manually in the dashboard,
 * uploads still work.
 */
export async function ensureBucket(): Promise<void> {
  if (bucketEnsured) return
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true })
  if (error) {
    const msg = error.message ?? ''
    const alreadyExists =
      /already exists/i.test(msg) || /duplicate/i.test(msg) || /409/.test(msg)
    if (!alreadyExists) {
      console.warn('[images] could not ensure bucket: ' + msg)
      bucketEnsured = true
      return
    }
  }
  console.log('[images] bucket p1-images ready')
  bucketEnsured = true
}

/**
 * Download an image from `url` and upload it to `storagePath` in the bucket.
 * Returns the storage path on success, or null on any failure (per-image
 * tolerance — never propagates). upsert:true makes re-runs idempotent.
 */
export async function uploadImage(url: string, storagePath: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': BROWSER_UA } })
    if (!res.ok) {
      console.warn('[images] fetch ' + res.status + ' for ' + url)
      return null
    }
    const bytes = new Uint8Array(await res.arrayBuffer())
    const contentType = res.headers.get('content-type') ?? 'image/jpeg'
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true })
    if (error) {
      console.warn('[images] upload failed ' + storagePath + ': ' + error.message)
      return null
    }
    return storagePath
  } catch (err) {
    console.warn('[images] error mirroring ' + url + ': ' + String(err))
    return null
  } finally {
    // Throttle between image operations (T-02-02 DoS mitigation).
    await new Promise((r) => setTimeout(r, THROTTLE_MS))
  }
}

/**
 * Mirror the event main image and every ticket seatplan image for `ev` into
 * Storage, then record each storage path in p1_events / p1_tickets. The original
 * *_url columns are preserved. Per-image and per-update failures warn and continue.
 */
export async function mirrorEventImages(ev: NormalizedEvent): Promise<void> {
  await ensureBucket()

  // Resolve the event id once (tickets are keyed by event_id + category_id).
  const { data: row, error: rowError } = await supabase
    .from('p1_events')
    .select('id')
    .eq('event_uuid', ev.event_uuid)
    .single()
  if (rowError || !row) {
    console.warn('[images] no p1_events row for ' + ev.event_uuid)
    return
  }

  // Event main image → events/{event_uuid}.jpg
  if (ev.main_image_url) {
    const path = await uploadImage(ev.main_image_url, `events/${ev.event_uuid}.jpg`)
    if (path) {
      const { error } = await supabase
        .from('p1_events')
        .update({ main_image_storage_path: path })
        .eq('event_uuid', ev.event_uuid)
      if (error) {
        console.warn('[images] update main_image_storage_path failed for ' + ev.event_uuid + ': ' + error.message)
      }
    }
  }

  // Each ticket's DISPLAY image (seat-view photo or GP banner) → own a stable copy
  // at tickets/{event_uuid}/{category_id}.jpg. The SVG seat-plan is no longer
  // mirrored (product decision: show the photo, not the plan). storage path is
  // recorded in seatplan_image_storage_path (reused column, no migration).
  for (const t of ev.tickets) {
    if (!t.display_image_url) continue
    const path = await uploadImage(
      t.display_image_url,
      `tickets/${ev.event_uuid}/${t.category_id}.jpg`
    )
    if (path) {
      const { error } = await supabase
        .from('p1_tickets')
        .update({ seatplan_image_storage_path: path })
        .eq('event_id', row.id)
        .eq('category_id', t.category_id)
      if (error) {
        console.warn('[images] update seatplan_image_storage_path failed for ' + ev.event_uuid + '/' + t.category_id + ': ' + error.message)
      }
    }
  }

  console.log('[images] mirrored ' + ev.name)
}
