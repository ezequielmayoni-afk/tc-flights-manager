// Extract "view from seat" photos and the GP banner from an event's public
// detail page (www.p1travel.com). The p1 checkout API only exposes the SVG
// seat-plan; the marketing photos ("Vista desde el asiento: Gold 6") live only
// in the server-rendered HTML / RSC payload as <img aria-description="..."> tags
// on media.p1travel.com (an ImageKit CDN). Coverage is partial: P1 publishes a
// handful of grandstand photos per event, not one per sector — so callers must
// fall back to the GP banner for sectors without a confident caption match.
// Everything here is defensive: malformed HTML yields empty results, never throws.

export interface SeatPhoto {
  /** Sector label exactly as P1 captions it, e.g. "Gold 6". */
  caption: string
  /** Full-size image URL (forced to a 1272px transform). */
  url: string
}

export interface DetailImages {
  seatPhotos: SeatPhoto[]
  /** GP hero/circuit banner, used as fallback for sectors without a photo. */
  bannerUrl: string | null
}

/** Normalize a media.p1travel/imagekit URL to a stable full-size variant. */
function normalizeMediaUrl(raw: string): string {
  // Strip any existing ImageKit transform/query, then request w-1272.
  const base = raw.split('?')[0]
  return `${base}?tr=w-1272`
}

/** Collapse HTML/JSON escaping so a single set of regexes works on HTML and RSC. */
function unescapeHtml(html: string): string {
  return html
    .replace(/\\u002[fF]/g, '/')
    .replace(/\\\//g, '/')
    .replace(/\\"/g, '"') // el payload RSC embebe JSON con comillas escapadas
    .replace(/&amp;/g, '&')
    .replace(/&#x2[fF];/g, '/')
}

const CAPTION_RE =
  /aria-description="(?:Vista desde el asiento|View from your seat):\s*([^"\\]+)"/i
const MEDIA_IN_TAG_RE =
  /https:\/\/(?:media\.p1travel\.com|ik\.imagekit\.io\/p1)\/[^"'\\ )]+\.(?:jpg|jpeg|png|webp)/i
const MEDIA_URL = 'https://(?:media\\.p1travel\\.com|ik\\.imagekit\\.io/p1)/[^"?\\\\ )]+\\.(?:jpg|jpeg|png|webp)'

/**
 * Extract the COMPLETE per-sector photo set from the RSC/JSON payload. Each seat
 * photo is an ImageKit file object:
 *   {"url":"https://ik.imagekit.io/p1/Belgian GP - Silver 4 Grandstand.jpg?...",
 *    ...,"customMetadata":{"description_es":"Vista desde el asiento: Silver 4"}}
 * Only a few of these are rendered as <img> tags (the visible carousel frame);
 * the rest live only in the RSC, which is why fetch-only parsing must read here
 * to get every sector's photo (not just the 4 visible ones).
 */
function extractRscPhotos(html: string): Map<string, string> {
  const res = new Map<string, string>()
  const capRe = /"description_es":"Vista desde el asiento:\s*([^"\\]+)"/g
  const urlRe = new RegExp(`"url":"(${MEDIA_URL})`, 'g')
  let m: RegExpExecArray | null
  while ((m = capRe.exec(html))) {
    const caption = m[1].trim()
    if (!caption || res.has(caption)) continue
    // La url del objeto aparece antes de customMetadata; tomamos la más cercana.
    const before = html.slice(Math.max(0, m.index - 1600), m.index)
    let lastUrl: string | null = null
    let u: RegExpExecArray | null
    urlRe.lastIndex = 0
    while ((u = urlRe.exec(before))) lastUrl = u[1]
    if (lastUrl) res.set(caption, normalizeMediaUrl(lastUrl))
  }
  return res
}

/**
 * Parse the seat-view photos, pairing each caption (sector label) with its image
 * URL. Reads the RSC payload (complete set) and also any rendered <img> tags.
 */
export function parseDetailImages(rawHtml: string): DetailImages {
  const html = unescapeHtml(rawHtml)
  const seatByCaption = extractRscPhotos(html)

  // Complementar con <img aria-description> renderizados (por si el RSC cambia).
  for (const m of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0]
    const cap = tag.match(CAPTION_RE)
    if (!cap) continue
    const caption = cap[1].trim()
    if (!caption || seatByCaption.has(caption)) continue
    const img = tag.match(MEDIA_IN_TAG_RE)
    if (img) seatByCaption.set(caption, normalizeMediaUrl(img[0]))
  }

  const seatPhotos: SeatPhoto[] = Array.from(seatByCaption.entries()).map(
    ([caption, url]) => ({ caption, url })
  )

  return { seatPhotos, bannerUrl: parseBanner(html) }
}

/** Find the GP hero/circuit banner among the page's media images. */
function parseBanner(html: string): string | null {
  const urls = Array.from(
    html.matchAll(/https:\/\/media\.p1travel\.com\/[^"'\\ )]+\.(?:jpg|jpeg|png|webp)/gi)
  ).map((m) => m[0])
  // Prefer a dedicated GP banner (e.g. "gp-belgium-banner-image-scaled.jpg").
  const banner =
    urls.find((u) => /banner.*scaled/i.test(u)) ||
    urls.find((u) => /gp-[a-z]+-banner/i.test(u)) ||
    urls.find((u) => /banner-image/i.test(u))
  return banner ? normalizeMediaUrl(banner) : null
}

/** Lowercase, strip accents, collapse spaces — for caption↔ticket-name matching. */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export interface TicketImageChoice {
  url: string | null
  /** Human caption, only set when a real seat photo matched. */
  caption: string | null
  source: 'seat_photo' | 'gp_banner' | 'none'
}

/**
 * Pick the image for a ticket/sector. A seat photo wins only when its caption is
 * a confident token match of the ticket name (caption contained in the name),
 * choosing the LONGEST matching caption to avoid ambiguity. Otherwise the GP
 * banner is used; if neither exists, source is 'none'.
 */
export function matchTicketImage(
  ticketName: string,
  images: DetailImages
): TicketImageChoice {
  const name = norm(ticketName)
  let best: SeatPhoto | null = null
  for (const p of images.seatPhotos) {
    const cap = norm(p.caption)
    if (!cap) continue
    if (name.includes(cap) && (!best || cap.length > norm(best.caption).length)) {
      best = p
    }
  }
  if (best) {
    return { url: best.url, caption: `Vista desde el asiento: ${best.caption}`, source: 'seat_photo' }
  }
  if (images.bannerUrl) {
    return { url: images.bannerUrl, caption: null, source: 'gp_banner' }
  }
  return { url: null, caption: null, source: 'none' }
}
