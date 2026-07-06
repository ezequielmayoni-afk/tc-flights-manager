// Resolve the (EVENT_UUID, CATEGORY_UUID) pair for an event by fetching its
// detail page and extracting the checkout link UUIDs. Returns null when no
// checkout link is present so the caller can skip the event (SCRAPE-06 tolerance).

import { BROWSER_UA, THROTTLE_MS } from '../config.js'

const CHECKOUT_LINK =
  /checkout\.p1travel\.com\/es\/([0-9a-f-]{36})\/ticket\?category_id=([0-9a-f-]{36})/i

export interface UuidPair {
  eventUuid: string
  categoryUuid: string
  /** Raw detail-page HTML, reused downstream to extract seat-view photos. */
  html: string
}

export function parseUuids(html: string): { eventUuid: string; categoryUuid: string } | null {
  const m = html.match(CHECKOUT_LINK)
  if (!m) return null
  return { eventUuid: m[1], categoryUuid: m[2] }
}

export async function resolveUuid(detailUrl: string): Promise<UuidPair | null> {
  let html: string
  try {
    const res = await fetch(detailUrl, { headers: { 'User-Agent': BROWSER_UA } })
    html = await res.text()
  } catch (err) {
    console.warn('[resolveUuid] fetch error for ' + detailUrl + ': ' + String(err))
    return null
  } finally {
    await new Promise((r) => setTimeout(r, THROTTLE_MS))
  }

  const pair = parseUuids(html)
  if (!pair) {
    console.warn('[resolveUuid] no checkout link found for ' + detailUrl)
    return null
  }
  return { ...pair, html }
}
