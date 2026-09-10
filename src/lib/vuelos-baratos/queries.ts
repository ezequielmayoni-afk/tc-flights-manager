import { ApiError } from '@/lib/api/errors'
import { cancelJob } from '@/lib/jobs/queue'
import type { Db, JobRow } from '@/lib/jobs/types'
import { OBSERVATION_WINDOW_HOURS } from './config'
import type { LandingDestinationRow, LandingRouteRow, ProbeRow } from './types'

/**
 * Lecturas y escrituras de vuelos.siviajo.com.
 *
 * `createAdminClient()` no tiene los tipos generados de la base, así que acá
 * se piden columnas explícitas y se castean las filas a los tipos del módulo
 * (mismo criterio que `src/lib/tendencias/queries.ts`). Nada de `select('*')`:
 * la landing lee estas tablas en cada request y `flight_price_probes` guarda
 * un JSON de opciones que casi nunca hace falta.
 */

const DESTINATION_COLUMNS =
  'code, slug, tc_code, iata_display, haul, seo_title, seo_description, hero_image_url, faq, active, sort_order, destination_profiles(name)'

const ROUTE_COLUMNS = 'id, destination_code, origin_tc_code, origin_name, stay_nights, weekdays, probes_per_month, months_ahead, active'

/** Lo que necesitan los agregados de la landing; `options` sólo bajo pedido. */
const PROBE_COLUMNS =
  'id, route_id, departure_date, return_date, nights, price_per_pax, currency, airline, airline_code, stops, stops_back, duration_minutes, duration_back_minutes, fare_family, checked_bag, carry_on, status, probed_at'

/** Un barrido completo de una ruta son ~100 filas por mes: 2000 cubre el año. */
const MAX_PROBE_ROWS = 2000
/** La home lee todas las rutas de una: mismo criterio, por lote. */
const MAX_PROBE_ROWS_MULTI = 5000
/** Salud: son 3 columnas por sonda, un día entero del barrido entra de sobra. */
const MAX_HEALTH_ROWS = 20_000

/** Fila a insertar en `flight_price_probes` (el id y las fechas los pone la base). */
export type ProbeInsert = Omit<ProbeRow, 'id' | 'probed_at'> & {
  probed_at?: string
  expires_at?: string
  /** Columnas del barrido que la landing no lee pero conviene guardar. */
  elapsed_ms?: number | null
  error?: string | null
}

/**
 * El nombre del destino vive en `destination_profiles`; PostgREST devuelve la
 * relación como objeto o como array de uno según cómo infiera la cardinalidad.
 */
function destinationName(relation: unknown, fallback: string): string {
  const row = Array.isArray(relation) ? relation[0] : relation
  const name = row && typeof row === 'object' ? (row as { name?: unknown }).name : null
  return typeof name === 'string' && name ? name : fallback
}

function toDestination(raw: Record<string, unknown>): LandingDestinationRow {
  const code = String(raw.code)
  return {
    code,
    slug: String(raw.slug),
    name: destinationName(raw.destination_profiles, code),
    tc_code: String(raw.tc_code),
    iata_display: (raw.iata_display as string | null) ?? null,
    haul: raw.haul as LandingDestinationRow['haul'],
    seo_title: (raw.seo_title as string | null) ?? null,
    seo_description: (raw.seo_description as string | null) ?? null,
    hero_image_url: (raw.hero_image_url as string | null) ?? null,
    faq: Array.isArray(raw.faq) ? (raw.faq as LandingDestinationRow['faq']) : [],
    active: raw.active === true,
    sort_order: Number(raw.sort_order ?? 100),
  }
}

/** `price_per_pax` es NUMERIC: PostgREST lo puede devolver como string. */
function toProbeRow(raw: Record<string, unknown>): ProbeRow {
  const price = raw.price_per_pax
  return {
    ...(raw as unknown as ProbeRow),
    price_per_pax: price === null || price === undefined ? null : Number(price),
  }
}

export async function listLandingDestinations(db: Db, opts: { activeOnly?: boolean } = {}): Promise<LandingDestinationRow[]> {
  let query = db.from('flight_landing_destinations').select(DESTINATION_COLUMNS).order('sort_order', { ascending: true })
  if (opts.activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(`No se pudieron leer los destinos de la landing: ${error.message}`)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toDestination)
}

export async function getLandingDestinationBySlug(db: Db, slug: string): Promise<LandingDestinationRow | null> {
  const { data, error } = await db.from('flight_landing_destinations').select(DESTINATION_COLUMNS).eq('slug', slug).maybeSingle()
  // Un fallo de la base no es "no existe": si se traga el error, el job lo
  // toma como destino despublicado y muere sin reintento.
  if (error) throw new Error(`No se pudo leer el destino ${slug}: ${error.message}`)
  return data ? toDestination(data as unknown as Record<string, unknown>) : null
}

export async function listRoutes(db: Db, opts: { activeOnly?: boolean; destinationCode?: string } = {}): Promise<LandingRouteRow[]> {
  let query = db
    .from('flight_landing_routes')
    .select(ROUTE_COLUMNS)
    .order('destination_code', { ascending: true })
    .order('origin_tc_code', { ascending: true })
  if (opts.activeOnly) query = query.eq('active', true)
  if (opts.destinationCode) query = query.eq('destination_code', opts.destinationCode)
  const { data, error } = await query
  if (error) throw new Error(`No se pudieron leer las rutas de la landing: ${error.message}`)
  return (data ?? []) as unknown as LandingRouteRow[]
}

export async function getRoute(db: Db, id: number): Promise<LandingRouteRow | null> {
  const { data, error } = await db.from('flight_landing_routes').select(ROUTE_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw new Error(`No se pudo leer la ruta ${id}: ${error.message}`)
  return (data as unknown as LandingRouteRow | null) ?? null
}

export async function getRouteByCodes(db: Db, destinationCode: string, originCode: string): Promise<LandingRouteRow | null> {
  const { data, error } = await db
    .from('flight_landing_routes')
    .select(ROUTE_COLUMNS)
    .eq('destination_code', destinationCode)
    .eq('origin_tc_code', originCode)
    .maybeSingle()
  if (error) throw new Error(`No se pudo leer la ruta ${originCode}→${destinationCode}: ${error.message}`)
  return (data as unknown as LandingRouteRow | null) ?? null
}

export interface RecentProbesOptions {
  /** Ventana de frescura; por defecto la que muestra la landing (48 h). */
  sinceHours?: number
  /** No traer salidas ya pasadas. */
  fromDate: string
  withOptions?: boolean
}

function sinceIso(sinceHours: number | undefined): string {
  return new Date(Date.now() - (sinceHours ?? OBSERVATION_WINDOW_HOURS) * 3_600_000).toISOString()
}

/** Observaciones vigentes de una ruta, de la más barata a la más cara. */
export async function getRecentProbes(db: Db, routeId: number, opts: RecentProbesOptions): Promise<ProbeRow[]> {
  const { data, error } = await db
    .from('flight_price_probes')
    .select(opts.withOptions ? `${PROBE_COLUMNS}, options` : PROBE_COLUMNS)
    .eq('route_id', routeId)
    .eq('status', 'ok')
    .gte('probed_at', sinceIso(opts.sinceHours))
    .gte('departure_date', opts.fromDate)
    .order('price_per_pax', { ascending: true })
    .limit(MAX_PROBE_ROWS)
  if (error) throw new Error(`No se pudieron leer las observaciones de la ruta ${routeId}: ${error.message}`)
  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toProbeRow)
}

/** Lo mismo para varias rutas en una sola consulta (la home lee todas). */
export async function getRecentProbesForRoutes(db: Db, routeIds: number[], opts: RecentProbesOptions): Promise<Map<number, ProbeRow[]>> {
  const porRuta = new Map<number, ProbeRow[]>()
  if (routeIds.length === 0) return porRuta

  const { data, error } = await db
    .from('flight_price_probes')
    .select(opts.withOptions ? `${PROBE_COLUMNS}, options` : PROBE_COLUMNS)
    .in('route_id', routeIds)
    .eq('status', 'ok')
    .gte('probed_at', sinceIso(opts.sinceHours))
    .gte('departure_date', opts.fromDate)
    // Primero por ruta: con el tope global, ordenar sólo por precio dejaría
    // sin filas a las rutas caras.
    .order('route_id', { ascending: true })
    .order('price_per_pax', { ascending: true })
    .limit(MAX_PROBE_ROWS_MULTI)
  if (error) throw new Error(`No se pudieron leer las observaciones del barrido: ${error.message}`)

  for (const raw of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const row = toProbeRow(raw)
    if (row.route_id === null) continue
    const actuales = porRuta.get(row.route_id)
    if (actuales) actuales.push(row)
    else porRuta.set(row.route_id, [row])
  }
  return porRuta
}

/**
 * La última observación vigente de cada ruta, sólo `route_id, probed_at`.
 *
 * Es lo único que necesita el `lastModified` del sitemap: traer las filas
 * enteras (precios, aerolíneas, escalas) para quedarse con una fecha por ruta
 * era pagar miles de columnas al pedo.
 */
export async function getLastProbedAtByRoute(db: Db, routeIds: number[], opts: RecentProbesOptions): Promise<Map<number, string>> {
  const porRuta = new Map<number, string>()
  if (routeIds.length === 0) return porRuta

  const { data, error } = await db
    .from('flight_price_probes')
    .select('route_id, probed_at')
    .in('route_id', routeIds)
    .eq('status', 'ok')
    .gte('probed_at', sinceIso(opts.sinceHours))
    .gte('departure_date', opts.fromDate)
    // Por ruta primero, igual que `getRecentProbesForRoutes`: con el tope
    // global, ordenar sólo por fecha dejaría rutas sin ninguna fila.
    .order('route_id', { ascending: true })
    .order('probed_at', { ascending: false })
    .limit(MAX_PROBE_ROWS_MULTI)
  if (error) throw new Error(`No se pudieron leer las fechas del barrido: ${error.message}`)

  for (const raw of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    const routeId = Number(raw.route_id)
    if (!Number.isFinite(routeId)) continue
    const probedAt = String(raw.probed_at ?? '')
    if (!probedAt) continue
    const actual = porRuta.get(routeId)
    if (actual === undefined || probedAt > actual) porRuta.set(routeId, probedAt)
  }
  return porRuta
}

export async function insertProbe(db: Db, row: ProbeInsert): Promise<void> {
  const { error } = await db.from('flight_price_probes').insert(row)
  if (error) throw new Error(`No se pudo guardar la sonda: ${error.message}`)
}

export interface PendingSweepJobs {
  /** Cuenta exacta del servidor: no depende de cuántas filas se hayan traído. */
  total: number
  queued: number
  running: number
  /** Jobs pendientes de cada ruta, para saber si "Barrer ahora" haría algo. */
  byRouteId: Map<number, number>
}

/**
 * Una noche del barrido son ~1500 jobs (rutas × meses × tandas). 5000 deja
 * margen para varias noches encimadas sin traerse la cola entera.
 */
const MAX_PENDING_JOB_ROWS = 5000

/**
 * Jobs del barrido en cola o corriendo, contados por ruta.
 *
 * Se piden tres columnas y no la fila entera: el tablero sólo cuenta. `total`
 * viene del `count` exacto de PostgREST, así que sigue siendo cierto aunque el
 * tope de filas corte el detalle.
 */
export async function countPendingSweepJobs(db: Db): Promise<PendingSweepJobs> {
  const { data, error, count } = await db
    .from('hub_jobs')
    .select('entity_id, kind, status', { count: 'exact' })
    .like('kind', 'flights.%')
    .in('status', ['queued', 'running'])
    .limit(MAX_PENDING_JOB_ROWS)
  if (error) throw new Error(`No se pudieron leer los jobs del barrido: ${error.message}`)

  const filas = (data ?? []) as unknown as Array<Pick<JobRow, 'entity_id' | 'kind' | 'status'>>
  const resumen: PendingSweepJobs = { total: count ?? filas.length, queued: 0, running: 0, byRouteId: new Map() }

  for (const job of filas) {
    if (job.status === 'running') resumen.running++
    else resumen.queued++
    // El plan (`flights.sweep.plan`) arma la noche de todas las rutas: no es
    // de ninguna, así que sólo cuenta en el total.
    if (job.kind !== 'flights.sweep' || !job.entity_id) continue
    // Sin el guard de arriba `Number(null)` sería 0 y se contaría como ruta.
    const routeId = Number(job.entity_id)
    if (!Number.isInteger(routeId)) continue
    resumen.byRouteId.set(routeId, (resumen.byRouteId.get(routeId) ?? 0) + 1)
  }
  return resumen
}

export interface RouteHealth {
  lastObservedAt: string | null
  ok: number
  empty: number
  errors: number
  timeouts: number
}

/**
 * Cómo viene rindiendo cada ruta: se traen las sondas del período con tres
 * columnas y se reduce en TS (Supabase no expone `group by`).
 */
export async function getSweepHealth(db: Db, sinceHours = 24): Promise<Map<number, RouteHealth>> {
  const { data, error } = await db
    .from('flight_price_probes')
    .select('route_id, status, probed_at')
    .not('route_id', 'is', null)
    .gte('probed_at', new Date(Date.now() - sinceHours * 3_600_000).toISOString())
    .limit(MAX_HEALTH_ROWS)
  if (error) throw new Error(`No se pudo leer la salud del barrido: ${error.message}`)

  const salud = new Map<number, RouteHealth>()
  for (const raw of (data ?? []) as unknown as Array<{ route_id: number | null; status: string; probed_at: string }>) {
    if (raw.route_id === null) continue
    let fila = salud.get(raw.route_id)
    if (!fila) {
      fila = { lastObservedAt: null, ok: 0, empty: 0, errors: 0, timeouts: 0 }
      salud.set(raw.route_id, fila)
    }
    if (raw.status === 'ok') fila.ok++
    else if (raw.status === 'empty') fila.empty++
    else if (raw.status === 'timeout') fila.timeouts++
    else fila.errors++
    if (fila.lastObservedAt === null || raw.probed_at > fila.lastObservedAt) fila.lastObservedAt = raw.probed_at
  }
  return salud
}

export type RoutePatch = Partial<Pick<LandingRouteRow, 'active' | 'probes_per_month' | 'stay_nights' | 'weekdays' | 'months_ahead' | 'origin_tc_code' | 'origin_name'>>

/** Fila nueva de `flight_landing_routes`; lo que falta toma el default de la tabla. */
export type RouteInsert = Pick<LandingRouteRow, 'destination_code' | 'origin_tc_code' | 'origin_name'> & Partial<Pick<LandingRouteRow, 'stay_nights' | 'weekdays' | 'probes_per_month' | 'months_ahead' | 'active'>>

export async function createRoute(db: Db, row: RouteInsert): Promise<LandingRouteRow> {
  const { data, error } = await db.from('flight_landing_routes').insert(row).select(ROUTE_COLUMNS).single()
  if (error) {
    if (error.code === '23505') throw new ApiError(`Ya existe la ruta ${row.origin_tc_code}→${row.destination_code}`, 409, 'CONFLICT')
    if (error.code === '23503') throw new ApiError(`El destino ${row.destination_code} no está en la landing`, 400, 'INVALID_REF')
    throw new Error(`No se pudo crear la ruta: ${error.message}`)
  }
  return data as unknown as LandingRouteRow
}

/** Borra una ruta; las sondas quedan (route_id pasa a null). Devuelve false si no existía. */
export async function deleteRoute(db: Db, id: number): Promise<boolean> {
  const { data, error } = await db.from('flight_landing_routes').delete().eq('id', id).select('id')
  if (error) throw new Error(`No se pudo borrar la ruta ${id}: ${error.message}`)
  return (data ?? []).length > 0
}

export async function updateRoute(db: Db, id: number, patch: RoutePatch): Promise<LandingRouteRow> {
  const { data, error } = await db
    .from('flight_landing_routes')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select(ROUTE_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`No se pudo actualizar la ruta ${id}: ${error.message}`)
  // Un id que no existe no es un error de la base: el API lo traduce a 404.
  if (!data) throw new Error(`La ruta ${id} no existe`)
  return data as unknown as LandingRouteRow
}

export type LandingDestinationPatch = Partial<Pick<LandingDestinationRow, 'active' | 'seo_title' | 'seo_description' | 'slug' | 'tc_code' | 'iata_display' | 'haul' | 'hero_image_url' | 'faq' | 'sort_order'>>

/** Fila nueva de `flight_landing_destinations`: `code` debe existir en `destination_profiles`. */
export type LandingDestinationInsert = Pick<LandingDestinationRow, 'code' | 'slug' | 'tc_code' | 'haul'> & Partial<Pick<LandingDestinationRow, 'iata_display' | 'seo_title' | 'seo_description' | 'hero_image_url' | 'faq' | 'active' | 'sort_order'>>

export async function createLandingDestination(db: Db, row: LandingDestinationInsert): Promise<LandingDestinationRow> {
  const { data, error } = await db.from('flight_landing_destinations').insert(row).select(DESTINATION_COLUMNS).single()
  if (error) {
    if (error.code === '23505') throw new ApiError(`Ya hay una landing con el código ${row.code} o el slug ${row.slug}`, 409, 'CONFLICT')
    if (error.code === '23503') throw new ApiError(`El perfil ${row.code} no existe en destination_profiles`, 400, 'INVALID_REF')
    throw new Error(`No se pudo crear el destino: ${error.message}`)
  }
  return toDestination(data as unknown as Record<string, unknown>)
}

/** Borra la landing y sus rutas (cascade); el perfil de destino queda. Devuelve false si no existía. */
export async function deleteLandingDestination(db: Db, code: string): Promise<boolean> {
  const { data, error } = await db.from('flight_landing_destinations').delete().eq('code', code).select('code')
  if (error) throw new Error(`No se pudo borrar el destino ${code}: ${error.message}`)
  return (data ?? []).length > 0
}

/**
 * Publica/despublica un destino de la landing y edita su SEO.
 *
 * Devuelve null si el código no existe (en vez de lanzar, como `updateRoute`):
 * así el API responde 404 sin una lectura previa, que acá no aporta nada
 * porque el update ya dice si tocó una fila.
 */
export async function updateLandingDestination(
  db: Db,
  code: string,
  patch: LandingDestinationPatch
): Promise<LandingDestinationRow | null> {
  const { data, error } = await db
    .from('flight_landing_destinations')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('code', code)
    .select(DESTINATION_COLUMNS)
    .maybeSingle()
  if (error) throw new Error(`No se pudo actualizar el destino ${code}: ${error.message}`)
  return data ? toDestination(data as unknown as Record<string, unknown>) : null
}

/**
 * Cancela los `flights.sweep` que quedaron en cola de noches anteriores.
 *
 * El barrido de anoche que no llegó a correr ya no sirve (los precios
 * cambiaron y el plan de hoy vuelve a encolar esos pares): dejarlos en cola
 * sólo tapa la cola del lane `cotizador`, que corre de a uno.
 */
export async function cancelStaleSweepJobs(db: Db, day: string): Promise<number> {
  const { data, error } = await db
    .from('hub_jobs')
    .select('id, dedupe_key')
    .eq('kind', 'flights.sweep')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
    .limit(1000)
  // Sin esto, una lectura fallida se veía igual que "no había nada viejo".
  if (error) throw new Error(`No se pudieron leer los barridos en cola: ${error.message}`)
  const viejos = ((data ?? []) as Array<{ id: number; dedupe_key: string | null }>).filter(j => !j.dedupe_key?.endsWith(`:${day}`))

  let cancelados = 0
  for (const job of viejos) {
    if (await cancelJob(db, job.id, 'flights.sweep.plan')) cancelados++
  }
  return cancelados
}
