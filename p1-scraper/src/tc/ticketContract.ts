import { tc, TC_SUPPLIER } from './client.js'

export interface P1EventRow {
  id: string; event_uuid: string; slug: string | null; name: string
  venue_name: string | null; city: string | null; country_code: string | null
  lat: number | null; lng: number | null; date_time: string | null; date_time_end: string | null
  main_image_url: string | null; marketing_label: string | null; description: string | null
  currency: string | null
}
export interface P1TicketRow {
  category_id: string; name: string | null; description: string | null
  seatplan_image_url: string | null; price: number | null; currency: string | null
  features: unknown
}

export interface DisplayImage {
  url: string | null
  caption: string | null
  source: 'seat_photo' | 'gp_banner' | 'none'
}

// The scraper stashes the chosen display image inside features._display_image
// (seat-view photo when matched, else GP banner). Read it defensively.
export function displayImage(t: P1TicketRow): DisplayImage {
  const di = (t.features as { _display_image?: DisplayImage } | null)?._display_image
  return {
    url: di?.url ?? null,
    caption: di?.caption ?? null,
    source: di?.source ?? 'none',
  }
}

const PRODUCT_TYPES = ['ONLY_TICKET', 'EVENT_TICKET', 'FLIGHT_HOTEL', 'MULTI', 'TRIP_PLANNER']

// Stable, unique ticket code derived from the p1 slug (TC codes are the identity key).
export function ticketCode(ev: P1EventRow): string {
  return `P1-${(ev.slug || ev.event_uuid).slice(0, 60)}`
}

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Build the ticket-level datasheet HTML: event blurb + the list of sectors with prices.
function buildDescriptionHtml(ev: P1EventRow, tickets: P1TicketRow[]): string {
  const head = ev.marketing_label || ev.description || `${esc(ev.name)} — entradas oficiales (vía P1 Travel).`
  const rows = tickets
    .map((t) => `<li><b>${esc(t.name)}</b> — desde ${t.price ?? '?'} ${t.currency || ev.currency || 'EUR'}</li>`)
    .join('')
  return `<p>${esc(head)}</p><p>Sectores disponibles:</p><ul>${rows}</ul>`
}

// ContractTicketVO mirroring the existing "Tickets GP F Monza" reference shape.
export function buildContractTicket(ev: P1EventRow, tickets: P1TicketRow[]) {
  const code = ticketCode(ev)
  // Gallery = the GP banner + each sector's display image (seat-view photo or
  // banner fallback). The SVG seat-plan is intentionally excluded.
  const imageUrls = Array.from(new Set([
    ev.main_image_url,
    ...tickets.map((t) => displayImage(t).url),
  ].filter((u): u is string => !!u))).slice(0, 20)

  return {
    code,
    name: ev.name,
    geolocation: { latitude: ev.lat ?? 0, longitude: ev.lng ?? 0 },
    city: ev.city || undefined,
    currency: (ev.currency || 'EUR') as string,
    productTypes: PRODUCT_TYPES,
    imageUrls,
    active: true,
    locationOrigin: false,
    meetingPointOrigin: false,
    cancellationRanges: [],
    modalityCodes: tickets.map((t) => modalityCode(t)),
    datasheets: {
      EN: {
        activityType: 'Tickets',
        activityTypeId: '26',
        name: ev.name,
        description: buildDescriptionHtml(ev, tickets),
        includes: [],
        excludes: [],
        languageOptions: [],
        meetingPoint: ev.venue_name || ev.city || '',
      },
    },
  }
}

export function modalityCode(t: P1TicketRow): string {
  return (t.name || t.category_id).trim().slice(0, 60)
}

// One modality per sector. Price → baseAdultPrice/Children/Infant. Date range from the event.
export function buildModality(ev: P1EventRow, t: P1TicketRow) {
  const price = t.price ?? 0
  const start = (ev.date_time || '').slice(0, 10)
  const end = (ev.date_time_end || ev.date_time || '').slice(0, 10)
  // Prepend the seat-view caption ("Vista desde el asiento: Gold 6") to the
  // modality remarks when we have a real photo for this sector.
  const img = displayImage(t)
  const caption = img.source === 'seat_photo' && img.caption ? img.caption + '. ' : ''
  const desc = (caption + (t.description || '')).slice(0, 500)
  return {
    code: modalityCode(t),
    priceType: 'DISTRIBUTION', // valid enum: FOR_FREE | DISTRIBUTION | SERVICE | OCCUPANCY
    baseAdultPrice: price,
    baseChildrenPrice: price,
    baseInfantPrice: price,
    baseServicePrice: 0,
    childAgeMin: 2,
    childAgeMax: 12,
    disallowAdult: false,
    disallowChildren: false,
    disallowInfant: false,
    onRequest: false,
    duration: 1,
    durationType: 'HOURS',
    startDate: start || undefined,
    endDate: end || undefined,
    operationalDays: ['FRIDAY', 'SATURDAY', 'SUNDAY'],
    languages: [],
    remarks: { EN: { name: t.name || modalityCode(t), remarks: desc } },
  }
}

function errMsg(body: unknown): string {
  const s = typeof body === 'string' ? body : JSON.stringify(body)
  return s.match(/"error":\[(.*?)\]/)?.[1] || s.slice(0, 200)
}

export async function pushTicket(ev: P1EventRow, tickets: P1TicketRow[]) {
  const code = ticketCode(ev)
  const contract = buildContractTicket(ev, tickets)
  // 1. create/update the ContractTicket.
  //    Both create and update target /tickets/{supplier} (code is in the body).
  //    POST = create, PUT = update. /tickets/{supplier}/{code} is for modalities, not the ticket.
  const exists = await tc(`/tickets/${TC_SUPPLIER}/${encodeURIComponent(code)}`)
  const method = exists.ok ? 'PUT' : 'POST'
  const res = await tc(`/tickets/${TC_SUPPLIER}`, { method, body: JSON.stringify(contract) })
  if (!res.ok) throw new Error(`ticket ${method} ${res.status}: ${errMsg(res.body)}`)
  // 2. create each modality (POST). On "already exists", retry as PUT update.
  const modResults: Array<{ code: string; status: number; ok: boolean; err?: string }> = []
  for (const t of tickets) {
    const m = buildModality(ev, t)
    let r = await tc(`/tickets/${TC_SUPPLIER}/${encodeURIComponent(code)}`, { method: 'POST', body: JSON.stringify(m) })
    if (!r.ok && /exist/i.test(errMsg(r.body))) {
      r = await tc(`/tickets/${TC_SUPPLIER}/${encodeURIComponent(code)}`, { method: 'PUT', body: JSON.stringify(m) })
    }
    modResults.push({ code: m.code, status: r.status, ok: r.ok, err: r.ok ? undefined : errMsg(r.body) })
  }
  return { code, ticketStatus: res.status, method, modResults }
}
