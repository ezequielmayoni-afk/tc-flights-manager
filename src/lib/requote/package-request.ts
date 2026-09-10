import type { QuoteMultiRequest, QuoteMultiResponse, QuoteOption } from '@/lib/cotizador/client'
import { canonicalRegimen } from '@/lib/producto/idea-builder'
import type { Regimen } from '@/lib/producto/types'

/**
 * Recotización de un paquete publicado con el cotizador-bot (sin sesión en
 * siviajo.com). Se le pide al cotizador la misma combinación que vende el
 * paquete: mismo origen, misma fecha, mismas noches por destino, mismo hotel
 * y régimen, mismos pasajeros, y directo si el paquete vuela directo. El
 * precio que devuelve es "lo que costaría hoy armarlo igual".
 *
 * Todo puro: sin red ni base, para poder testearlo con dobles.
 */

export interface RequoteHotel {
  hotel_name: string | null
  hotel_category: string | null
  stars: number | null
  nights: number | null
  board_type: string | null
  board_name: string | null
  destination_code: string | null
  check_in_date: string | null
  sort_order: number | null
}

export interface RequoteTransport {
  transport_type: string | null
  origin_code: string | null
  departure_date: string | null
  num_segments: number | null
  sort_order: number | null
  day: number | null
}

export interface RequoteDestination {
  destination_code: string | null
  destination_name: string | null
  sort_order: number | null
}

export interface PackageForRequote {
  id: number
  tc_package_id: number
  origin_code: string | null
  departure_date: string | null
  flight_departure_date: string | null
  nights_count: number | null
  adults_count: number | null
  children_count: number | null
  tours_count: number | null
  hotels: RequoteHotel[]
  transports: RequoteTransport[]
  destinations: RequoteDestination[]
  profile: { cotizador_instance: 'emisivo' | 'nacional' } | null
  /** Aéreo de contrato: no se recotiza contra el mercado. */
  isCupo: boolean
}

export type BuildResult =
  | { ok: true; request: QuoteMultiRequest; instance: 'emisivo' | 'nacional'; expectedHotels: string[] }
  | { ok: false; reason: string }

const DEFAULT_CHILD_AGE = 8

/** Nuestro régimen canónico → el vocabulario del cotizador. */
const COTIZADOR_REGIMEN: Record<Regimen, NonNullable<QuoteMultiRequest['tramos'][number]['regimen']>> = { all_inclusive: 'all_inclusive', media_pension: 'media_pension', desayuno: 'desayuno', sin_pension: 'solo_alojamiento' }
const DEFAULT_STARS = 3

const bySort = <T extends { sort_order: number | null }>(rows: T[]): T[] => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

/** 'S4' / '4*' / '4 estrellas' → 4 */
export function starsFromCategory(category: string | null | undefined): number | null {
  if (!category) return null
  const m = /([1-5])/.exec(category)
  return m ? Number(m[1]) : null
}

export function buildPackageQuoteRequest(pkg: PackageForRequote): BuildResult {
  if (pkg.isCupo) return { ok: false, reason: 'Paquete de cupo: el aéreo es de contrato y no se recotiza contra el mercado' }
  if ((pkg.tours_count ?? 0) > 0) return { ok: false, reason: 'Circuito cerrado: el cotizador no arma este producto' }

  const hotels = bySort(pkg.hotels)
  if (hotels.length === 0) return { ok: false, reason: 'El paquete no tiene hotel cargado' }

  const flights = bySort(pkg.transports.filter(t => !t.transport_type || t.transport_type.toUpperCase() === 'FLIGHT'))
  const date = pkg.flight_departure_date ?? pkg.departure_date ?? hotels[0].check_in_date
  if (!date) return { ok: false, reason: 'El paquete no tiene fecha de salida' }

  const destinations = bySort(pkg.destinations)
  const tramos: QuoteMultiRequest['tramos'] = []
  for (const [i, hotel] of hotels.entries()) {
    const fallback = destinations.length === hotels.length ? destinations[i] : destinations[Math.min(i, destinations.length - 1)]
    const destCode = hotel.destination_code ?? fallback?.destination_code ?? null
    if (!destCode) return { ok: false, reason: 'El paquete no tiene destino cargado' }
    const noches = hotel.nights ?? (hotels.length === 1 ? pkg.nights_count : null)
    if (!noches || noches <= 0) return { ok: false, reason: `Sin noches para el hotel ${hotel.hotel_name ?? i + 1}` }
    const regimen = canonicalRegimen(hotel.board_type ?? hotel.board_name)
    const stars = hotel.stars ?? starsFromCategory(hotel.hotel_category) ?? DEFAULT_STARS
    const name = hotel.hotel_name?.trim()
    tramos.push({
      destino: `Destination::${destCode.trim().toUpperCase()}`,
      noches,
      ...(regimen ? { regimen: COTIZADOR_REGIMEN[regimen] } : {}),
      ...(name ? { hotel_preferido: name } : {}),
      estrellas_min: Math.min(stars, 5),
    })
  }

  const children = Math.max(0, pkg.children_count ?? 0)
  const request: QuoteMultiRequest = {
    origen: (flights[0]?.origin_code ?? pkg.origin_code ?? 'BUE').trim().toUpperCase(),
    fecha_inicio: date,
    tramos,
    adultos: Math.max(1, pkg.adults_count ?? 2),
    menores: Array.from({ length: children }, () => DEFAULT_CHILD_AGE),
    max_opciones: 5,
    vuelo_directo: flights.length > 0 && flights.every(f => (f.num_segments ?? 1) === 1),
    tipo_paquete: flights.length > 0 ? 'vuelo_hotel' : 'solo_hotel',
  }
  return { ok: true, request, instance: pkg.profile?.cotizador_instance ?? 'emisivo', expectedHotels: hotels.map(h => h.hotel_name?.trim() ?? '').filter(Boolean) }
}

const STOPWORDS = new Set(['hotel', 'hotels', 'resort', 'resorts', 'spa', 'all', 'inclusive', 'todo', 'incluido', 'by', 'the', 'de', 'del', 'la', 'el', 'los', 'las', 'y', 'and', 'an', 'a', 'suites', 'suite', 'apartments', 'apartamentos', 'inn'])

export function normalizeHotelText(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim()
}

/** Palabras que identifican al hotel ("vik arena blanca"); sin ellas no se puede comparar. */
export function hotelTokens(name: string): string[] {
  return normalizeHotelText(name).split(' ').filter(t => t.length >= 3 && !STOPWORDS.has(t))
}

/** true si la opción menciona al hotel: al menos el 70 % de sus palabras clave aparecen en el JSON de la opción. */
export function optionMentionsHotel(option: QuoteOption, hotelName: string): boolean {
  const tokens = hotelTokens(hotelName)
  if (tokens.length === 0) return false
  const hay = normalizeHotelText(JSON.stringify(option))
  const hits = tokens.filter(t => hay.includes(t)).length
  return hits / tokens.length >= 0.7
}

export interface PickedOption { option: QuoteOption | null; matched: boolean }

/**
 * La opción a comparar: la más barata entre las que traen el mismo hotel que
 * el paquete. Si ninguna lo trae, la más barata de todas y `matched: false`,
 * porque un precio de otro hotel no dice nada del nuestro.
 */
export function pickMatchingOption(res: QuoteMultiResponse, expectedHotels: string[]): PickedOption {
  const options = (res.opciones ?? []).filter(o => typeof o.precio_pp_final === 'number')
  if (options.length === 0) return { option: null, matched: false }
  const cheapest = (list: QuoteOption[]) => [...list].sort((a, b) => (a.precio_pp_final ?? Infinity) - (b.precio_pp_final ?? Infinity))[0]
  if (expectedHotels.length === 0) return { option: cheapest(options), matched: false }
  const matching = options.filter(o => expectedHotels.every(h => optionMentionsHotel(o, h)))
  if (matching.length > 0) return { option: cheapest(matching), matched: true }
  return { option: cheapest(options), matched: false }
}
