import type { createAdminClient } from '@/lib/supabase/admin'

/**
 * Matcheo entre los cupos cargados en Vuelos (`flights`) y los paquetes que los
 * venden (`packages` vía `package_transports`).
 *
 * No hay ninguna relación en la base entre las dos cosas, así que se deduce.
 * Esta lógica estaba escrita tres veces con criterios distintos; acá queda una
 * sola, y se agrega el número de vuelo, que hasta ahora se recibía y se
 * descartaba.
 *
 * La cascada es:
 *   1. aerolínea + número de vuelo + fecha dentro del rango   → confianza alta
 *   2. aerolínea + identificador literal + fecha              → confianza alta
 *   3. aerolínea + ruta + fecha dentro del rango              → confianza media
 *
 * El nivel 2 existe porque TC arma transport_number pegando el código de
 * aerolínea al num_service tal cual está cargado, incluso cuando no es un
 * número: el charter con num_service "Si Viajo4" llega como "LASi Viajo4".
 * Sin ese nivel, un charter cae al nivel 3 y, si hay dos cupos de la misma
 * aerolínea el mismo día y ruta, se elige el equivocado. Pasa de verdad: el
 * 05/11 hay dos cupos LA a GRU, uno agotado y otro con lugar.
 *
 * El nivel 3 es el criterio que ya existía y sigue siendo el último recurso.
 */

type Db = ReturnType<typeof createAdminClient>

export type MatchCriteria = 'airline_number_date' | 'airline_route_date'
export type MatchConfidence = 'alta' | 'media'

export interface FlightCupos {
  total: number
  sold: number
  remaining: number
}

export interface FlightForMatch {
  id: number
  supplier_id: number | null
  airline_code: string | null
  base_id: string | null
  name: string | null
  start_date: string
  end_date: string
  leg_type: 'outbound' | 'return' | null
  paired_flight_id: number | null
  tc_transport_id: string | null
  active?: boolean | null
  flight_segments: Array<{
    departure_location_code: string | null
    arrival_location_code: string | null
    num_service: string | null
    sort_order?: number | null
  }>
  modalities: Array<{
    modality_inventories: Array<{
      quantity: number | null
      sold: number | null
      remaining_seats: number | null
    }>
  }>
}

export interface TransportForMatch {
  package_id?: number
  marketing_airline_code: string | null
  origin_code: string | null
  destination_code: string | null
  departure_date: string | null
  transport_number: string | null
}

export interface FlightMatchResult {
  flight: FlightForMatch
  flightId: number
  supplierId: number | null
  cupos: FlightCupos
  criteria: MatchCriteria
  confidence: MatchConfidence
}

/** El select compartido, para que los consumidores no armen cada uno el suyo. */
export const FLIGHT_MATCH_SELECT = `
  id,
  supplier_id,
  airline_code,
  base_id,
  name,
  start_date,
  end_date,
  leg_type,
  paired_flight_id,
  tc_transport_id,
  active,
  flight_segments (
    departure_location_code,
    arrival_location_code,
    num_service,
    sort_order
  ),
  modalities (
    modality_inventories (
      quantity,
      sold,
      remaining_seats
    )
  )
`

/**
 * Lleva los dos formatos al mismo terreno: los cupos guardan el número solo
 * ("3812") y TC manda el número con la aerolínea adelante ("JA3812").
 *
 * Devuelve null cuando el valor no es un número de vuelo — los charters cargan
 * texto libre ahí ("CHARTER SI VIAJO", "Si Viajo4"), y tomarles los dígitos
 * sueltos generaría matcheos falsos.
 */
export function normalizeFlightNumber(value: string | null | undefined): string | null {
  if (!value) return null

  const trimmed = value.trim()
  // Opcionalmente hasta 3 letras de aerolínea, opcionalmente un espacio, y el número.
  const match = trimmed.match(/^([A-Za-z]{0,3})\s?(\d{1,5})$/)
  if (!match) return null

  // Se sacan los ceros a la izquierda: "0502" y "502" son el mismo vuelo.
  return String(parseInt(match[2], 10))
}

/**
 * Identificador del vuelo tal como lo pega TC: sin espacios y en mayúsculas,
 * para poder comparar "Si Viajo4" con el "LASi Viajo4" que llega del paquete.
 */
function normalizeServiceText(value: string | null | undefined): string | null {
  if (!value) return null
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '')
  return normalized.length > 0 ? normalized : null
}

/** Le saca al transport_number el código de aerolínea que TC le pega adelante. */
function stripAirlinePrefix(transportNumber: string, airlineCode: string): string | null {
  const num = normalizeServiceText(transportNumber)
  const airline = normalizeServiceText(airlineCode)
  if (!num || !airline) return null
  return num.startsWith(airline) ? num.slice(airline.length) || null : num
}

/** Suma TODAS las modalidades y TODOS los inventarios del vuelo. */
export function calculateCupos(modalities: FlightForMatch['modalities']): FlightCupos {
  let total = 0
  let sold = 0
  let remaining = 0

  for (const modality of modalities || []) {
    for (const inv of modality.modality_inventories || []) {
      total += inv.quantity || 0
      sold += inv.sold || 0
      remaining += inv.remaining_seats ?? inv.quantity ?? 0
    }
  }

  return { total, sold, remaining }
}

function segmentsInOrder(flight: FlightForMatch) {
  const segments = [...(flight.flight_segments || [])]
  // sort_order puede venir null en datos viejos: en ese caso se respeta el orden
  // en que llegaron, que es lo que hacía el código anterior.
  if (segments.every(s => typeof s.sort_order === 'number')) {
    segments.sort((a, b) => (a.sort_order as number) - (b.sort_order as number))
  }
  return segments
}

/** Ruta del cupo: origen del primer tramo y destino del último. */
export function getFlightRoute(flight: FlightForMatch): { origin: string | null; destination: string | null } {
  const segments = segmentsInOrder(flight)
  if (segments.length === 0) return { origin: null, destination: null }
  return {
    origin: segments[0]?.departure_location_code ?? null,
    destination: segments[segments.length - 1]?.arrival_location_code ?? null,
  }
}

interface IndexedFlight {
  flight: FlightForMatch
  cupos: FlightCupos
}

export interface FlightMatchIndex {
  byNumber: Map<string, IndexedFlight[]>
  byService: Map<string, IndexedFlight[]>
  byRoute: Map<string, IndexedFlight[]>
  flights: IndexedFlight[]
}

export function buildFlightMatchIndex(flights: FlightForMatch[]): FlightMatchIndex {
  const byNumber = new Map<string, IndexedFlight[]>()
  const byService = new Map<string, IndexedFlight[]>()
  const byRoute = new Map<string, IndexedFlight[]>()
  const indexed: IndexedFlight[] = []

  // Orden estable por id: si dos cupos compiten por el mismo transporte, gana
  // siempre el mismo y no depende de cómo vino la query.
  for (const flight of [...flights].sort((a, b) => a.id - b.id)) {
    const entry: IndexedFlight = { flight, cupos: calculateCupos(flight.modalities) }
    indexed.push(entry)

    const segments = segmentsInOrder(flight)
    if (segments.length === 0) continue

    for (const segment of segments) {
      if (!flight.airline_code) continue

      const num = normalizeFlightNumber(segment.num_service)
      if (num) {
        const key = `${flight.airline_code}-${num}`
        if (!byNumber.has(key)) byNumber.set(key, [])
        const bucket = byNumber.get(key)!
        if (!bucket.includes(entry)) bucket.push(entry)
      }

      const service = normalizeServiceText(segment.num_service)
      if (service) {
        const key = `${flight.airline_code}-${service}`
        if (!byService.has(key)) byService.set(key, [])
        const bucket = byService.get(key)!
        if (!bucket.includes(entry)) bucket.push(entry)
      }
    }

    const { origin, destination } = getFlightRoute(flight)
    if (!origin || !destination) continue
    const routeKey = `${flight.airline_code}-${origin}-${destination}`
    if (!byRoute.has(routeKey)) byRoute.set(routeKey, [])
    byRoute.get(routeKey)!.push(entry)
  }

  return { byNumber, byService, byRoute, flights: indexed }
}

function departureInRange(departureDate: string | null, flight: FlightForMatch): boolean {
  if (!departureDate) return false
  const dep = new Date(departureDate)
  return dep >= new Date(flight.start_date) && dep <= new Date(flight.end_date)
}

function toResult(entry: IndexedFlight, criteria: MatchCriteria): FlightMatchResult {
  return {
    flight: entry.flight,
    flightId: entry.flight.id,
    supplierId: entry.flight.supplier_id,
    cupos: entry.cupos,
    criteria,
    confidence: criteria === 'airline_number_date' ? 'alta' : 'media',
  }
}

/** Busca el cupo que corresponde a un tramo de un paquete. */
export function matchTransport(index: FlightMatchIndex, transport: TransportForMatch): FlightMatchResult | null {
  const airline = transport.marketing_airline_code
  if (!airline) return null

  // Nivel 1: número de vuelo
  const num = normalizeFlightNumber(transport.transport_number)
  if (num) {
    for (const entry of index.byNumber.get(`${airline}-${num}`) || []) {
      if (departureInRange(transport.departure_date, entry.flight)) {
        return toResult(entry, 'airline_number_date')
      }
    }
  }

  // Nivel 2: identificador literal, para los charters cuyo num_service es texto
  const service = transport.transport_number
    ? stripAirlinePrefix(transport.transport_number, airline)
    : null
  if (service) {
    for (const entry of index.byService.get(`${airline}-${service}`) || []) {
      if (departureInRange(transport.departure_date, entry.flight)) {
        return toResult(entry, 'airline_number_date')
      }
    }
  }

  // Nivel 3: ruta (el criterio que ya existía)
  const origin = transport.origin_code
  const destination = transport.destination_code
  if (!origin || !destination) return null

  for (const entry of index.byRoute.get(`${airline}-${origin}-${destination}`) || []) {
    if (departureInRange(transport.departure_date, entry.flight)) {
      return toResult(entry, 'airline_route_date')
    }
  }

  return null
}

/** Todos los cupos que usa un paquete, uno por tramo que matchee. */
export function matchPackageFlights(index: FlightMatchIndex, transports: TransportForMatch[]): FlightMatchResult[] {
  const results: FlightMatchResult[] = []
  for (const transport of transports || []) {
    const match = matchTransport(index, transport)
    if (match) results.push(match)
  }
  return results
}

/**
 * Cupos agregados de un paquete.
 *
 * Toma el máximo entre los tramos, que es lo que venía haciendo la pantalla
 * comercial. Es discutible (si la ida está agotada el paquete no se vende,
 * aunque la vuelta tenga lugar), pero cambiarlo movería números ya en uso.
 */
export function aggregatePackageCupos(matches: FlightMatchResult[]): FlightCupos {
  let total = 0
  let sold = 0
  let remaining = 0
  for (const m of matches) {
    total = Math.max(total, m.cupos.total)
    sold = Math.max(sold, m.cupos.sold)
    remaining = Math.max(remaining, m.cupos.remaining)
  }
  return { total, sold, remaining }
}

export async function loadFlightsForMatch(
  db: Db,
  opts: { activeOnly?: boolean; flightIds?: number[] } = {}
): Promise<FlightForMatch[]> {
  let query = db.from('flights').select(FLIGHT_MATCH_SELECT)
  if (opts.activeOnly !== false) query = query.eq('active', true)
  if (opts.flightIds?.length) query = query.in('id', opts.flightIds)

  const { data, error } = await query
  if (error) {
    console.error('[flight-match] Error cargando vuelos:', error)
    return []
  }
  return (data || []) as unknown as FlightForMatch[]
}

/** Paquete → cupos que usa. */
export async function findFlightsForPackages(
  db: Db,
  packageIds: number[]
): Promise<Map<number, FlightMatchResult[]>> {
  const result = new Map<number, FlightMatchResult[]>()
  if (packageIds.length === 0) return result

  const [flights, { data: transports }] = await Promise.all([
    loadFlightsForMatch(db),
    db
      .from('package_transports')
      .select('package_id, marketing_airline_code, origin_code, destination_code, departure_date, transport_number')
      .in('package_id', packageIds),
  ])

  const index = buildFlightMatchIndex(flights)
  const byPackage = new Map<number, TransportForMatch[]>()
  for (const t of (transports || []) as TransportForMatch[]) {
    if (!t.package_id) continue
    if (!byPackage.has(t.package_id)) byPackage.set(t.package_id, [])
    byPackage.get(t.package_id)!.push(t)
  }

  for (const [packageId, list] of byPackage) {
    const matches = matchPackageFlights(index, list)
    if (matches.length > 0) result.set(packageId, matches)
  }

  return result
}

export interface PackageMatchResult {
  packageId: number
  tcPackageId: number
  title: string
  status: string | null
  tcActive: boolean | null
  sendToMarketing: boolean | null
  criteria: MatchCriteria
  confidence: MatchConfidence
}

/**
 * Cupo → paquetes que lo venden.
 *
 * IMPORTANTE: el índice se arma con TODOS los cupos, no solo con los que se
 * están consultando. Si se indexara únicamente el subconjunto, un paquete cuyo
 * vuelo real quedó afuera caería al nivel de ruta y se lo atribuiría al cupo
 * equivocado — por ejemplo, marcar como agotado un paquete que en realidad
 * vuela en otro cupo con lugar.
 *
 * Se acota la búsqueda de transportes a las aerolíneas de interés para no
 * traerse toda la tabla.
 */
export async function findPackagesForFlights(
  db: Db,
  flights: FlightForMatch[],
  allFlights?: FlightForMatch[]
): Promise<Map<number, PackageMatchResult[]>> {
  const result = new Map<number, PackageMatchResult[]>()
  if (flights.length === 0) return result

  const universe = allFlights?.length ? allFlights : await loadFlightsForMatch(db)
  const targetIds = new Set(flights.map(f => f.id))

  const airlines = [...new Set(flights.map(f => f.airline_code).filter((a): a is string => !!a))]
  if (airlines.length === 0) return result

  const { data: transports, error } = await db
    .from('package_transports')
    .select(`
      package_id,
      marketing_airline_code,
      origin_code,
      destination_code,
      departure_date,
      transport_number,
      packages ( id, tc_package_id, title, status, tc_active, send_to_marketing )
    `)
    .in('marketing_airline_code', airlines)

  if (error) {
    console.error('[flight-match] Error cargando transportes:', error)
    return result
  }

  const index = buildFlightMatchIndex(universe)

  for (const row of (transports || []) as unknown as Array<
    TransportForMatch & {
      packages: {
        id: number
        tc_package_id: number
        title: string
        status: string | null
        tc_active: boolean | null
        send_to_marketing: boolean | null
      } | null
    }
  >) {
    const pkg = row.packages
    if (!pkg) continue

    const match = matchTransport(index, row)
    // Solo interesan los que matchean con alguno de los cupos consultados.
    if (!match || !targetIds.has(match.flightId)) continue

    const list = result.get(match.flightId) || []
    // Un paquete puede matchear el mismo cupo por ida y vuelta: se lista una vez.
    if (!list.some(p => p.packageId === pkg.id)) {
      list.push({
        packageId: pkg.id,
        tcPackageId: pkg.tc_package_id,
        title: pkg.title,
        status: pkg.status,
        tcActive: pkg.tc_active,
        sendToMarketing: pkg.send_to_marketing,
        criteria: match.criteria,
        confidence: match.confidence,
      })
    }
    result.set(match.flightId, list)
  }

  return result
}
