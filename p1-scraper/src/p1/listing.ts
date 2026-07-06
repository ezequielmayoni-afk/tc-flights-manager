// Discover ALL F1 events by paginating the season listing
// (/es/series/formula-1-2026?page=N). This page is server-rendered: a raw fetch
// already contains every event link, and higher page numbers accumulate results
// (page 6 returns the full ~54). We extract the /es/motorsports/formula-1/<slug>
// links, dedupe, and stop after 2 consecutive pages add zero new links (the site
// does not 404 out-of-range pages). Names/dates/prices are NOT read here — they
// come from the checkout API in normalize.ts; the listing only needs URLs+slugs.

import { BROWSER_UA, THROTTLE_MS } from '../config.js'

// Temporada configurable (el año cambia); override con P1_SERIES_SLUG.
const SERIES_SLUG = process.env.P1_SERIES_SLUG || 'formula-1-2026'
const LISTING_BASE = `https://www.p1travel.com/es/series/${SERIES_SLUG}?page=`
const ORIGIN = 'https://www.p1travel.com'
const F1_LINK_RE = /\/es\/motorsports\/formula-1\/[a-z0-9-]+/gi

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

function lastPathSegment(path: string): string {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() ?? ''
}

export async function scrapeListing(): Promise<ListingEvent[]> {
  const seen = new Map<string, ListingEvent>()
  let page = 1
  let emptyStreak = 0
  const MAX_PAGES = 30 // backstop

  while (emptyStreak < 2 && page <= MAX_PAGES) {
    let html: string
    try {
      const res = await fetch(LISTING_BASE + page, { headers: { 'User-Agent': BROWSER_UA } })
      html = await res.text()
    } catch (err) {
      console.warn('[listing] fetch error on page ' + page + ': ' + String(err))
      break
    }

    // Rutas relativas de detalle (pueden repetirse en el markup); dedupe por path.
    const paths = Array.from(new Set(html.match(F1_LINK_RE) ?? []))
    let newThisPage = 0
    for (const path of paths) {
      const url = ORIGIN + path
      if (seen.has(url)) continue
      seen.set(url, { url, slug: lastPathSegment(path), name: '' })
      newThisPage++
    }

    if (newThisPage === 0) emptyStreak++
    else emptyStreak = 0

    console.log(`[listing] página ${page}: +${newThisPage} nuevos (total ${seen.size})`)
    page++
    await new Promise((r) => setTimeout(r, THROTTLE_MS))
  }

  console.log(`[listing] ${seen.size} eventos F1 descubiertos`)
  return [...seen.values()]
}
