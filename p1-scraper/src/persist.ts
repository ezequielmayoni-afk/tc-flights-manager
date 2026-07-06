// Idempotently write a NormalizedEvent to Supabase: upsert the event by
// event_uuid, upsert its tickets by (event_id, category_id), append a
// p1_price_history row per ticket, and run a per-event availability sweep that
// marks tickets of THIS event absent from the current run as 'unavailable'
// (never deletes). DB errors warn and return/continue rather than abort the
// whole run (DATA-02 idempotent upsert, DATA-04 availability sweep, SCRAPE-06).

import { supabase } from './supabase.js'
import type { NormalizedEvent } from './p1/normalize.js'
import { translateDescription } from './p1/translate.js'

export async function persistEvent(ev: NormalizedEvent): Promise<void> {
  const now = new Date().toISOString()

  const eventRow = {
    event_uuid: ev.event_uuid,
    source_url: ev.source_url,
    slug: ev.slug,
    name: ev.name,
    series: ev.series,
    status: ev.status,
    venue_name: ev.venue_name,
    city: ev.city,
    country_code: ev.country_code,
    lat: ev.lat,
    lng: ev.lng,
    time_zone: ev.time_zone,
    date_time: ev.date_time,
    date_time_end: ev.date_time_end,
    main_image_url: ev.main_image_url,
    marketing_label: ev.marketing_label,
    description: ev.description,
    price_ticket_only: ev.price_ticket_only,
    price_ticket_hotel: ev.price_ticket_hotel,
    price_compare: ev.price_compare,
    currency: ev.currency,
    active: true,
    last_seen_at: now,
    updated_at: now,
  }

  const { data: eventData, error: eventError } = await supabase
    .from('p1_events')
    .upsert(eventRow, { onConflict: 'event_uuid' })
    .select('id')
    .single()

  if (eventError || !eventData) {
    console.warn(
      '[persist] event upsert failed ' + ev.event_uuid + ': ' + (eventError?.message ?? 'no id returned')
    )
    return
  }

  const eventId = eventData.id as string

  // Upsert all tickets for this event.
  // Display image (seat-view photo or GP-banner fallback) is stashed in the
  // features jsonb under `_display_image` — no schema migration needed. TC push
  // and the review report read it from there.
  const ticketRows = ev.tickets.map((t) => ({
    event_id: eventId,
    category_id: t.category_id,
    name: t.name,
    description: t.description,
    description_es: translateDescription(t.description),
    seatplan_image_url: t.seatplan_image_url,
    price: t.price,
    currency: t.currency,
    features: {
      ...(t.features ?? {}),
      _display_image: {
        url: t.display_image_url,
        caption: t.display_image_caption,
        source: t.display_image_source,
      },
    },
    delivery_type: t.delivery_type,
    availability: 'available',
    last_seen_at: now,
    updated_at: now,
  }))

  if (ticketRows.length > 0) {
    const { data: upserted, error: ticketError } = await supabase
      .from('p1_tickets')
      .upsert(ticketRows, { onConflict: 'event_id,category_id' })
      .select('id, price')

    if (ticketError) {
      console.warn('[persist] ticket upsert failed for ' + ev.event_uuid + ': ' + ticketError.message)
    } else if (upserted) {
      // DATA-03: one price snapshot per ticket per run. Prices are dynamic, so every
      // non-dry run appends history regardless of whether the price changed.
      const historyRows = upserted.map((row) => ({
        ticket_id: row.id as string,
        price: row.price as number,
        currency: 'EUR',
        recorded_at: now,
      }))
      const { error: histError } = await supabase.from('p1_price_history').insert(historyRows)
      if (histError) {
        console.warn('[persist] price_history insert failed for ' + ev.event_uuid + ': ' + histError.message)
      }
    }
  }

  // Per-event availability sweep (DATA-04): tickets of THIS event whose
  // category_id is not in the current run become 'unavailable'. Only build the
  // filter when there is at least one current category id. Never delete.
  const currentCategoryIds = ev.tickets.map((t) => t.category_id)
  if (currentCategoryIds.length > 0) {
    const inList = '(' + currentCategoryIds.map((id) => '"' + id + '"').join(',') + ')'
    const { error: sweepError } = await supabase
      .from('p1_tickets')
      .update({ availability: 'unavailable', updated_at: new Date().toISOString() })
      .eq('event_id', eventId)
      .not('category_id', 'in', inList)
    if (sweepError) {
      console.warn('[persist] availability sweep failed for ' + ev.event_uuid + ': ' + sweepError.message)
    }
  }
}

/**
 * Dry-mode helper: print the event and a compact table of its tickets without
 * writing to the DB. Used by the entrypoint's `--dry` mode.
 */
export async function dryPrintEvent(ev: NormalizedEvent): Promise<void> {
  console.log(
    '\n[dry] ' + ev.name + ' (' + ev.event_uuid + ') — ' + ev.tickets.length + ' ticket(s)'
  )
  console.table(
    ev.tickets.map((t) => ({
      name: t.name,
      price: t.price,
      seatplan: t.seatplan_image_url ? 'yes' : 'no',
      descLen: t.description.length,
    }))
  )
}
