import type { QuoteMultiRequest, QuoteMultiResponse, QuoteOption } from '@/lib/cotizador/client'
import type { DestinationProfile, FareCell, IdeaDraft, Regimen } from './types'

/**
 * De una idea + su perfil al pedido del cotizador, y de la respuesta del
 * cotizador a un resumen que se guarda y se muestra. Puro.
 */

export interface IdeaRow {
  id: number
  kind: 'web' | 'cupo' | 'departure'
  source: string
  status: string
  destination_code: string | null
  destination_name: string
  origin: string
  month: string | null
  flexibility: string | null
  departure_date: string | null
  chosen_departure_date: string | null
  nights: number
  adults: number
  children: number
  children_ages: number[] | null
  regimen: Regimen | null
  stars_min: number | null
  direct_flight: boolean | null
  hotel_preferred: string | null
  budget_max_pp: number | null
  tramos: unknown
}

export function ideaToDraft(idea: IdeaRow): IdeaDraft {
  return {
    destinationCode: idea.destination_code ?? '',
    origin: idea.origin,
    month: idea.month ?? (idea.departure_date ?? idea.chosen_departure_date ?? '').slice(0, 7),
    nights: idea.nights,
    adults: idea.adults,
    children: idea.children,
    regimen: idea.regimen,
    starsMin: idea.stars_min,
    directFlight: idea.direct_flight,
    departureDate: idea.departure_date ?? idea.chosen_departure_date ?? null,
  }
}

const DEFAULT_CHILD_AGE = 8

export function buildQuoteRequest(
  idea: IdeaRow,
  profile: DestinationProfile,
  options: { directOnly?: boolean; fixedDate?: string | null } = {}
): QuoteMultiRequest {
  const fixedDate = options.fixedDate ?? idea.departure_date ?? idea.chosen_departure_date ?? null
  const menores = idea.children > 0
    ? (idea.children_ages?.length ? idea.children_ages : Array.from({ length: idea.children }, () => DEFAULT_CHILD_AGE))
    : []
  const request: QuoteMultiRequest = {
    origen: idea.origin || 'BUE',
    tramos: [{
      destino: profile.tc_destination_code ? `Destination::${profile.tc_destination_code}` : profile.name,
      ...(profile.iata_airport ? { iata_aeropuerto: profile.iata_airport } : {}),
      noches: idea.nights,
      ...(idea.regimen ?? profile.regimen_required ? { regimen: (idea.regimen ?? profile.regimen_required) as NonNullable<QuoteMultiRequest['tramos'][number]['regimen']> } : {}),
      ...(idea.hotel_preferred ? { hotel_preferido: idea.hotel_preferred } : {}),
      estrellas_min: idea.stars_min ?? profile.stars_min,
    }],
    adultos: idea.adults,
    menores,
    max_opciones: 3,
    vuelo_directo: options.directOnly ?? (profile.direct_required || idea.direct_flight === true),
    tipo_paquete: 'vuelo_hotel',
  }
  if (idea.budget_max_pp) request.presupuesto_max_pp = Number(idea.budget_max_pp)
  if (fixedDate) {
    request.fecha_inicio = fixedDate
  } else if (idea.month) {
    request.mes = idea.month
    request.flexibilidad = (['mes', 'quincena_1', 'quincena_2', 'exacta'].includes(idea.flexibility ?? '') ? idea.flexibility : 'mes') as QuoteMultiRequest['flexibilidad']
  }
  return request
}

/** "8h10m" → 490 */
export function durationToMinutes(value: string | null | undefined): number | null {
  if (!value) return null
  const h = /(\d+)\s*h/.exec(value)
  const m = /(\d+)\s*m/.exec(value)
  if (!h && !m) return null
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0)
}

/** Régimen tal como lo escribe TC o el cotizador → canónico. */
export function canonicalRegimen(board: string | null | undefined): Regimen | null {
  if (!board) return null
  const b = board.toLowerCase()
  if (/all\s*inclusive|todo\s*incluido|\bai\b/.test(b)) return 'all_inclusive'
  if (/media\s*pensi|half\s*board|\bhb\b/.test(b)) return 'media_pension'
  if (/desayuno|breakfast|\bbb\b|\bb&b/.test(b)) return 'desayuno'
  if (/sin\s*pensi|solo\s*alojamiento|room\s*only|\bro\b|\bsa\b|sin\s*comida/.test(b)) return 'sin_pension'
  if (/pensi[oó]n\s*completa|full\s*board|\bfb\b/.test(b)) return 'media_pension'
  return null
}

export interface QuoteSummary {
  status: string
  ok: boolean
  diagnostico: string | null
  pricePp: number | null
  totalPrice: number | null
  currency: string
  hotelName: string | null
  hotelCode: string | null
  hotelUrl: string | null
  board: string | null
  regimen: Regimen | null
  stars: number | null
  regimenConfirmed: boolean
  gama: string | null
  airline: string | null
  flightNumbers: string[]
  stops: number | null
  direct: boolean | null
  durationMinutes: number | null
  overnightStop: boolean
  checkedBag: boolean | null
  departureDate: string | null
  returnDate: string | null
  dateReason: string | null
  warnings: string[]
  alternatives: FareCell[]
  elapsedSeconds: number | null
  optionsCount: number
}

function pickOption(res: QuoteMultiResponse): QuoteOption | null {
  const options = res.opciones ?? []
  if (options.length === 0) return null
  const idx = res.analisis?.recomendacion_idx
  if (typeof idx === 'number' && options[idx]) return options[idx]
  return [...options].sort((a, b) => (a.precio_pp_final ?? Infinity) - (b.precio_pp_final ?? Infinity))[0]
}

export function summarizeQuote(res: QuoteMultiResponse): QuoteSummary {
  const option = pickOption(res)
  // El cotizador manda el vuelo a nivel raíz (`vuelo`); `vuelo_compartido` es un booleano.
  const flight = (res.vuelo && typeof res.vuelo === 'object' ? res.vuelo : null)
    ?? (res.vuelo_compartido && typeof res.vuelo_compartido === 'object' ? res.vuelo_compartido : null)
    ?? option?.vuelo
    ?? null
  const stopsRaw = flight?.ida?.escalas
  const stops = typeof stopsRaw === 'number' && stopsRaw >= 0 ? stopsRaw : null
  const warnings = [...(res.avisos ?? []), ...(option?.avisos ?? []), ...(res.errores ?? [])]
  const alternatives: FareCell[] = (res.fechas?.alternativas ?? []).filter(a => a.pp).map(a => ({
    date: a.fecha,
    pricePerPax: Number(a.pp),
    currency: res.moneda ?? 'USD',
    direct: a.escalas === 0,
    durationMinutes: durationToMinutes(a.duracion),
    airline: null,
    stops: typeof a.escalas === 'number' && a.escalas >= 0 ? a.escalas : undefined,
    source: 'cotizador_probe' as const,
  }))
  return {
    status: res.status,
    ok: res.status === 'ok' && option !== null,
    diagnostico: res.diagnostico?.mensaje ?? res.diagnostico?.motivo ?? null,
    pricePp: option?.precio_pp_final ?? null,
    totalPrice: option?.precio_total_final ?? null,
    currency: res.moneda ?? 'USD',
    hotelName: option?.hotel?.nombre ?? null,
    hotelCode: option?.hotel?.code ?? null,
    hotelUrl: option?.hotel?.url && /^https?:\/\//.test(option.hotel.url) ? option.hotel.url : null,
    board: option?.hotel?.regimen ?? null,
    regimen: canonicalRegimen(option?.hotel?.regimen),
    stars: option?.hotel?.estrellas ?? null,
    regimenConfirmed: option ? !option.regimen_no_confirmado : false,
    gama: option?.gama ?? null,
    airline: flight?.aerolinea ?? flight?.ida?.aerolinea ?? null,
    flightNumbers: [flight?.numero_vuelo_ida ?? flight?.ida?.numeros_vuelo?.join('/'), flight?.numero_vuelo_vuelta ?? flight?.vuelta?.numeros_vuelo?.join('/')].filter((x): x is string => Boolean(x)),
    stops,
    direct: stops === null ? null : stops === 0,
    durationMinutes: durationToMinutes(flight?.ida?.duracion),
    overnightStop: Boolean(flight?.ida?.llega_dia_siguiente && (stops ?? 0) > 0),
    checkedBag: flight?.equipaje?.valija_facturada ?? null,
    departureDate: res.fechas?.elegida ?? res.viaje?.fecha_ida ?? null,
    returnDate: res.fechas?.vuelta ?? res.viaje?.fecha_vuelta ?? null,
    dateReason: res.fechas?.motivo ?? null,
    warnings,
    alternatives,
    elapsedSeconds: res.elapsed_seconds ?? null,
    optionsCount: res.opciones?.length ?? 0,
  }
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export function monthLabel(month: string | null | undefined): string {
  if (!month) return ''
  const [y, m] = month.split('-').map(Number)
  return m >= 1 && m <= 12 ? `${MONTHS[m - 1]} ${y}` : month
}

const REGIMEN_TITLE: Record<Regimen, string> = { all_inclusive: 'all inclusive', media_pension: 'media pensión', desayuno: 'con desayuno', sin_pension: '' }

export function suggestTitle(profile: DestinationProfile, idea: IdeaRow, summary: QuoteSummary | null): string {
  const regimen = summary?.regimen ?? idea.regimen ?? profile.regimen_required
  const when = summary?.departureDate ? `salida ${summary.departureDate.slice(8, 10)}/${summary.departureDate.slice(5, 7)}/${summary.departureDate.slice(0, 4)}` : monthLabel(idea.month)
  const parts = [profile.name, `${idea.nights} noches`, regimen ? REGIMEN_TITLE[regimen] : '', when]
  return parts.filter(Boolean).join(' · ')
}

/** Celda del calendario a partir del resumen (para la regla directo/escala). */
export function summaryToFareCell(summary: QuoteSummary, source: FareCell['source'] = 'cotizador_probe'): FareCell | null {
  if (!summary.ok || !summary.pricePp || !summary.departureDate) return null
  return {
    date: summary.departureDate,
    pricePerPax: summary.pricePp,
    currency: summary.currency,
    direct: summary.direct === true,
    durationMinutes: summary.durationMinutes,
    airline: summary.airline,
    flightNumbers: summary.flightNumbers,
    stops: summary.stops ?? undefined,
    overnightStop: summary.overnightStop,
    source,
  }
}
