// Discover all F1 events on p1travel.com by paginating the motorsports listing,
// parsing the CollectionPage JSON-LD, keeping only /motorsports/formula-1/ events,
// deduping by URL, and stopping after 2 consecutive pages add zero new URLs
// (the site does not 404 out-of-range pages).

import { BROWSER_UA, THROTTLE_MS } from '../config.js'
import { extractJsonLd } from './jsonld.js'

const LISTING_BASE = 'https://www.p1travel.com/es/events/motorsports?page='
const F1_PATH = '/motorsports/formula-1/'

export interface ListingEvent {
  url: string
  slug: string
  name: string
  startDate?: string
  endDate?: string
  image?: string
  location?: string
  fromPrice?: string
}

function lastPathSegment(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, '')
    return path.split('/').filter(Boolean).pop() ?? ''
  } catch {
    return url.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''
  }
}

function isF1Url(url: string): boolean {
  try {
    return new URL(url).pathname.includes(F1_PATH)
  } catch {
    return url.includes(F1_PATH)
  }
}

function toLocation(location: any): string | undefined {
  if (!location) return undefined
  if (typeof location === 'string') return location
  if (typeof location.name === 'string') return location.name
  return undefined
}

export async function scrapeListing(): Promise<ListingEvent[]> {
  const seen = new Map<string, ListingEvent>()
  let page = 1
  let emptyStreak = 0

  while (emptyStreak < 2) {
    let html: string
    try {
      const res = await fetch(LISTING_BASE + page, {
        headers: { 'User-Agent': BROWSER_UA },
      })
      html = await res.text()
    } catch (err) {
      console.warn('[listing] fetch error on page ' + page + ': ' + String(err))
      break
    }

    const blocks = extractJsonLd(html)
    const collection = blocks.find((obj) => obj?.['@type'] === 'CollectionPage')
    const elements: any[] = collection?.mainEntity?.itemListElement ?? []

    let newThisPage = 0
    for (const el of elements) {
      const item = el.item ?? el
      if (item?.['@type'] !== 'SportsEvent') continue
      const url: string | undefined = item.url
      if (!url || !isF1Url(url)) continue
      if (seen.has(url)) continue

      seen.set(url, {
        url,
        slug: lastPathSegment(url),
        name: item.name ?? '',
        startDate: item.startDate,
        endDate: item.endDate,
        image: typeof item.image === 'string' ? item.image : item.image?.url,
        location: toLocation(item.location),
        fromPrice:
          item.offers?.lowPrice ??
          item.offers?.price ??
          (Array.isArray(item.offers) ? item.offers[0]?.price : undefined),
      })
      newThisPage++
    }

    if (newThisPage === 0) emptyStreak++
    else emptyStreak = 0

    page++
    await new Promise((r) => setTimeout(r, THROTTLE_MS))
  }

  return [...seen.values()]
}
