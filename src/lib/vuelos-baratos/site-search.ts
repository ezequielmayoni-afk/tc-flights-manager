import { z } from 'zod'
import { SITE_SEARCH_MAX_OPTIONS } from './config'
import { daysBetween, isValidIsoDate, todayIso } from './date-pairs'

/**
 * Las búsquedas reales de vuelos que hacen los viajeros en siviajo.com.
 *
 * Una etiqueta de GTM en la página de resultados de "solo vuelo" manda un
 * beacon con la búsqueda y las tarjetas que vio el viajero. Ese precio es el
 * mismo que mide el barrido (sale del mismo motor), así que se guarda como una
 * observación más en `flight_price_probes` con `source='tc_search'` y el
 * barrido nocturno no vuelve a sondear lo que ya se vio.
 *
 * Este módulo es puro (sin red, sin base, sin `process.env`): valida el
 * beacon y lo traduce a una búsqueda normalizada. El endpoint
 * (`/api/vuelos-baratos/site-search`) hace el resto.
 */

export const siteSearchBeaconSchema = z.object({
  v: z.literal(1),
  section: z.string().max(40),
  subsection: z.string().max(40).optional(),
  search: z.object({
    departureCode: z.string().max(16),
    departureName: z.string().max(80).optional(),
    destinationCode: z.string().max(16).optional(),
    destinationName: z.string().max(80).optional(),
    startDate: z.string().max(10),
    endDate: z.string().max(10).optional(),
    adults: z.union([z.string(), z.number()]).optional(),
    children: z.union([z.string(), z.number()]).optional(),
    infants: z.union([z.string(), z.number()]).optional(),
  }),
  itinerary: z
    .array(
      z.object({
        position: z.number().optional(),
        type: z.string().max(20).optional(),
        destinationCode: z.string().max(16).optional(),
        destinationName: z.string().max(80).optional(),
        startDate: z.string().max(10).optional(),
        endDate: z.string().max(10).optional(),
        nights: z.number().optional(),
      })
    )
    .max(10)
    .nullish(),
  items: z
    .array(
      z.object({
        id: z.string().max(200).optional(),
        price: z.union([z.string(), z.number()]).optional(),
        brand: z.string().max(60).optional(),
        variant: z.string().max(10).optional(),
        start: z.string().max(10).optional(),
        end: z.string().max(10).optional(),
      })
    )
    .max(60),
  url: z.string().max(200).optional(),
  ts: z.number().optional(),
})
export type SiteSearchBeacon = z.infer<typeof siteSearchBeaconSchema>

export interface SiteSearchOption {
  airline: string | null
  pricePp: number
  itineraryId: string | null
}

export interface SiteSearch {
  /** Código TC del origen ('BUE'). */
  origin: string
  /** Código TC del destino ('MIA'). */
  destinationCode: string
  destinationName: string | null
  /** YYYY-MM-DD */
  depart: string
  /** YYYY-MM-DD */
  return: string
  nights: number
  adults: number
  /** Menores (pagan tarifa y dividen el precio). */
  children: number
  /** Infantes (viajan con tarifa mínima: no dividen el precio). */
  infants: number
  /**
   * 'empty' si no hubo tarjetas de ida y vuelta con precio válido.
   *
   * El `price` de cada tarjeta en el dataLayer es el TOTAL de los pasajeros
   * (con 2 adultos, 1772.34 donde la página muestra "US$886" por persona):
   * los precios de acá ya están divididos por adultos + menores.
   */
  status: 'ok' | 'empty'
  minPricePp: number | null
  /** La aerolínea de la tarjeta más barata. */
  airline: string | null
  /** Hasta `SITE_SEARCH_MAX_OPTIONS`, de la más barata a la más cara. */
  options: SiteSearchOption[]
  /** Tarjetas de ida y vuelta válidas. */
  results: number
  url: string | null
}

const CODIGO = /^[A-Z0-9-]{2,8}$/
/** Arriba de esto (por persona) es un precio mal leído, no una tarifa. */
const PRECIO_MAXIMO = 20_000
const MAX_ADULTOS = 9

/** Clave de dedupe: misma ruta, fechas y pasajeros. */
export function siteSearchKey(s: SiteSearch): string {
  return [s.origin, s.destinationCode, s.depart, s.return, s.adults, s.children, s.infants].join('|')
}

function codigo(raw: string | undefined): string | null {
  const limpio = (raw ?? '').trim().toUpperCase()
  return CODIGO.test(limpio) ? limpio : null
}

function nombre(raw: string | undefined): string | null {
  const limpio = (raw ?? '').trim()
  return limpio === '' ? null : limpio
}

/** `'1'`, `1` o nada (default) → entero; cualquier otra cosa → null. */
function entero(raw: string | number | undefined, porDefecto: number): number | null {
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return porDefecto
  const n = Number(raw)
  return Number.isInteger(n) ? n : null
}

/**
 * El precio por persona de una tarjeta: el `price` del dataLayer es el total
 * de los que pagan (adultos + menores; los infantes van con tarifa mínima y
 * no cuentan). El rango se mide ya dividido.
 */
function precioPorPersona(raw: string | number | undefined, paxPagan: number): number | null {
  if (raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return null
  const n = Number(raw) / paxPagan
  return Number.isFinite(n) && n > 0 && n < PRECIO_MAXIMO ? n : null
}

const redondear = (n: number): number => Math.round(n * 100) / 100

/**
 * Traduce el beacon a una búsqueda normalizada. Devuelve null (y el motivo) cuando no es
 * una búsqueda de solo vuelo ida y vuelta válida.
 */
export function parseSiteSearch(beacon: SiteSearchBeacon, today: Date): { search: SiteSearch } | { search: null; reason: string } {
  if (beacon.section !== 'ONLY_FLIGHT') return { search: null, reason: 'seccion' }

  const origin = codigo(beacon.search.departureCode)
  if (!origin) return { search: null, reason: 'origen' }

  // TC manda el destino de la búsqueda igual al origen en "solo vuelo" (la
  // vuelta cierra el círculo): el destino real es la primera parada del
  // itinerario que no es el origen.
  const parada = (beacon.itinerary ?? []).find(
    e => e.type === 'DESTINATION' && (e.position ?? -1) >= 1 && codigo(e.destinationCode) !== null && codigo(e.destinationCode) !== origin
  )
  const directo = codigo(beacon.search.destinationCode)
  let destinationCode: string
  let destinationName: string | null
  if (directo && directo !== origin) {
    destinationCode = directo
    destinationName = nombre(beacon.search.destinationName)
  } else if (parada) {
    destinationCode = codigo(parada.destinationCode)!
    destinationName = nombre(parada.destinationName)
  } else {
    return { search: null, reason: 'destino' }
  }

  const depart = beacon.search.startDate
  const vuelta = beacon.search.endDate ?? parada?.endDate
  if (!isValidIsoDate(depart) || !isValidIsoDate(vuelta) || vuelta! < depart || depart < todayIso(today)) {
    return { search: null, reason: 'fechas' }
  }
  const back = vuelta!

  const adults = entero(beacon.search.adults, 1)
  const menores = entero(beacon.search.children, 0)
  const infantes = entero(beacon.search.infants, 0)
  if (adults === null || adults < 1 || adults > MAX_ADULTOS || menores === null || menores < 0 || infantes === null || infantes < 0) {
    return { search: null, reason: 'pasajeros' }
  }

  const tarjetas = beacon.items
    .filter(item => (item.variant ?? '').trim().toUpperCase() === 'RT')
    .map(item => ({ item, pricePp: precioPorPersona(item.price, adults + menores) }))
    .filter((t): t is { item: (typeof beacon.items)[number]; pricePp: number } => t.pricePp !== null)
    .sort((a, b) => a.pricePp - b.pricePp)

  const options: SiteSearchOption[] = tarjetas.slice(0, SITE_SEARCH_MAX_OPTIONS).map(t => ({
    airline: nombre(t.item.brand),
    pricePp: redondear(t.pricePp),
    itineraryId: t.item.id ?? null,
  }))
  const mejor = options[0]

  return {
    search: {
      origin,
      destinationCode,
      destinationName,
      depart,
      return: back,
      nights: daysBetween(depart, back),
      adults,
      children: menores,
      infants: infantes,
      status: mejor ? 'ok' : 'empty',
      minPricePp: mejor ? mejor.pricePp : null,
      airline: mejor ? mejor.airline : null,
      options,
      results: tarjetas.length,
      url: beacon.url ? beacon.url.slice(0, 200) : null,
    },
  }
}

/** `Origin` del request dentro de la allow-list (comparación exacta, sin barra final). */
export function siteSearchOriginAllowed(headers: Headers, allowed: readonly string[]): boolean {
  const origin = headers.get('origin')
  if (!origin) return false
  const limpio = origin.trim().replace(/\/+$/, '')
  return allowed.includes(limpio)
}

/** Las columnas de `flight_price_probes` que necesita el panel del admin. */
export interface SiteSearchStatRow {
  probed_at: string
  origin: string
  destination: string | null
  destination_code: string | null
  route_id: number | null
  price_per_pax: number | string | null
  status: string
}

export interface SiteSearchStats {
  perDay: Array<{ day: string; searches: number; withRoute: number }>
  topRoutes: Array<{
    origin: string
    destinationCode: string
    destinationName: string | null
    searches: number
    minPricePp: number | null
    routeId: number | null
  }>
}

/** Rutas que muestra el panel. */
const TOP_RUTAS = 10

/**
 * El resumen del panel, en memoria: un día por fila (los `days` días UTC que
 * terminan hoy, con ceros donde no hubo búsquedas) y las rutas más buscadas.
 * El desempate de las rutas es por el mínimo visto (las sin precio al final).
 */
export function aggregateSiteSearchStats(rows: SiteSearchStatRow[], days: number, now: Date = new Date()): SiteSearchStats {
  const hoy = todayIso(now)
  const porDia = new Map<string, { day: string; searches: number; withRoute: number }>()
  for (let i = Math.max(1, days) - 1; i >= 0; i--) {
    const day = new Date(Date.parse(`${hoy}T00:00:00Z`) - i * 86_400_000).toISOString().slice(0, 10)
    porDia.set(day, { day, searches: 0, withRoute: 0 })
  }

  const porRuta = new Map<string, SiteSearchStats['topRoutes'][number]>()
  for (const row of rows) {
    const dia = porDia.get(String(row.probed_at).slice(0, 10))
    if (!dia) continue
    dia.searches++
    if (row.route_id !== null && row.route_id !== undefined) dia.withRoute++

    const destinationCode = row.destination_code ?? row.destination ?? ''
    const clave = `${row.origin}|${destinationCode}`
    let ruta = porRuta.get(clave)
    if (!ruta) {
      ruta = { origin: row.origin, destinationCode, destinationName: null, searches: 0, minPricePp: null, routeId: null }
      porRuta.set(clave, ruta)
    }
    ruta.searches++
    if (!ruta.destinationName && row.destination && row.destination !== destinationCode) ruta.destinationName = row.destination
    if (ruta.routeId === null && row.route_id !== null && row.route_id !== undefined) ruta.routeId = Number(row.route_id)
    const precioFila = row.status === 'ok' && row.price_per_pax !== null ? Number(row.price_per_pax) : NaN
    if (Number.isFinite(precioFila) && (ruta.minPricePp === null || precioFila < ruta.minPricePp)) ruta.minPricePp = precioFila
  }

  const topRoutes = [...porRuta.values()]
    .sort((a, b) => b.searches - a.searches || (a.minPricePp ?? Infinity) - (b.minPricePp ?? Infinity))
    .slice(0, TOP_RUTAS)

  return { perDay: [...porDia.values()], topRoutes }
}
