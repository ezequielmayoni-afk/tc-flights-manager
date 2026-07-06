// Transform the locked p1travel API `P1EventData` envelope into the internal
// model persist.ts writes to Supabase. Per-ticket price = base TICKET_ONLY +
// the matching ticket_option.supplement_pp (matched by category_id). All field
// access is defensive: a missing/malformed field logs a warning and is skipped
// or defaulted — normalizeEvent never throws, returning null on top-level failure
// (SCRAPE-05 full sector capture + price math, SCRAPE-06 tolerance).

import type { P1EventData } from './api.js'
import { parseDetailImages, matchTicketImage } from './detailImages.js'

export interface NormalizedTicket {
  category_id: string
  name: string
  description: string
  seatplan_image_url: string | null
  price: number
  currency: string
  features: Record<string, any>
  delivery_type: string | null
  // Display image resolved from the detail page (Plan: seat-view photos).
  // Set by enrichEventImages() after normalize; defaults until then.
  display_image_url: string | null
  display_image_caption: string | null
  display_image_source: 'seat_photo' | 'gp_banner' | 'none'
}

export interface NormalizedEvent {
  event_uuid: string
  source_url: string
  slug: string
  name: string
  series: string
  status: string | null
  venue_name: string | null
  city: string | null
  country_code: string | null
  lat: number | null
  lng: number | null
  time_zone: string | null
  date_time: string | null
  date_time_end: string | null
  main_image_url: string | null
  // GP hero/circuit banner from the detail page; also used as main image
  // fallback when the API returns no content.main_image. Set by enrichEventImages().
  banner_image_url: string | null
  marketing_label: string | null
  description: string | null
  price_ticket_only: number | null
  price_ticket_hotel: number | null
  price_compare: number | null
  currency: string
  tickets: NormalizedTicket[]
}

/**
 * Enrich a normalized event with seat-view photos parsed from its detail-page
 * HTML. Sets the GP banner (also used as main-image fallback) and, per ticket,
 * the display image: the real "view from seat" photo when its caption confidently
 * matches the sector name, otherwise the GP banner. Never throws — a parse miss
 * simply leaves every ticket on the banner (or 'none' if there is no banner).
 */
export function enrichEventImages(ev: NormalizedEvent, html: string): void {
  try {
    const images = parseDetailImages(html)
    ev.banner_image_url = images.bannerUrl
    if (!ev.main_image_url && images.bannerUrl) ev.main_image_url = images.bannerUrl

    for (const t of ev.tickets) {
      const choice = matchTicketImage(t.name, images)
      t.display_image_url = choice.url ?? ev.main_image_url ?? null
      t.display_image_caption = choice.caption
      t.display_image_source = choice.url ? choice.source : 'none'
    }
  } catch (err) {
    console.warn('[normalize] enrichEventImages failed for ' + ev.event_uuid + ': ' + err)
  }
}

/** Parse a numeric-ish value; returns null when it is not a finite number. */
function num(s: unknown): number | null {
  const n = parseFloat(String(s))
  return Number.isFinite(n) ? n : null
}

export function normalizeEvent(
  data: P1EventData,
  ctx: { eventUuid: string; sourceUrl: string; slug: string }
): NormalizedEvent | null {
  try {
    const pricesPp = data.base_package?.prices_pp ?? {}
    const price_ticket_only = num(pricesPp.TICKET_ONLY)
    const price_ticket_hotel = num(pricesPp.TICKET_HOTEL)

    // prices_compare arrives as either a plain string or a prices_pp-style map.
    const pc = data.base_package?.prices_compare
    const priceCompareRaw = typeof pc === 'string' ? pc : pc?.TICKET_ONLY
    const price_compare = num(priceCompareRaw)

    // Map category_id → supplement_pp for the per-ticket price math.
    const optionMap = new Map<string, string | undefined>()
    for (const opt of data.base_package?.ticket_options ?? []) {
      if (opt.category_id) optionMap.set(opt.category_id, opt.supplement_pp)
    }

    const features = data.category_properties ?? {}

    const tickets: NormalizedTicket[] = []
    for (const t of data.tickets ?? []) {
      const categoryId = t.category_id
      if (!categoryId) {
        console.warn('[normalize] ticket without category_id on ' + ctx.eventUuid + ' — skipped')
        continue
      }
      let supplement = num(optionMap.get(categoryId))
      if (supplement === null) {
        console.warn('[normalize] no ticket_option for category ' + categoryId + ' on ' + ctx.eventUuid)
        supplement = 0
      }
      const price = (price_ticket_only ?? 0) + supplement
      tickets.push({
        category_id: categoryId,
        name: t.name ?? '',
        description: t.description ?? '',
        seatplan_image_url: t.seatplan_image ?? null,
        price,
        currency: 'EUR',
        features,
        delivery_type: t.possible_ticket_types?.[0] ?? null,
        display_image_url: null,
        display_image_caption: null,
        display_image_source: 'none',
      })
    }

    const venue = data.venue
    const content = data.content

    return {
      event_uuid: ctx.eventUuid,
      source_url: ctx.sourceUrl,
      slug: ctx.slug,
      name: data.name ?? '',
      series: 'formula-1',
      status: data.status ?? null,
      venue_name: venue?.name ?? null,
      city: venue?.city?.name ?? null,
      country_code: venue?.country_code ?? null,
      lat: venue?.latitude ?? null,
      lng: venue?.longitude ?? null,
      time_zone: venue?.time_zone ?? null,
      date_time: data.date_time ?? null,
      date_time_end: data.date_time_end ?? null,
      main_image_url: content?.main_image ?? null,
      banner_image_url: null,
      marketing_label: content?.marketing_label ?? null,
      description: content?.description ?? null,
      price_ticket_only,
      price_ticket_hotel,
      price_compare,
      currency: 'EUR',
      tickets,
    }
  } catch (err) {
    console.warn('[normalize] failed for ' + ctx.eventUuid + ': ' + err)
    return null
  }
}
