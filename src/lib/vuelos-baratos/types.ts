/**
 * Tipos de vuelos.siviajo.com.
 *
 * Las filas (`*Row`) espejan las columnas de
 * `supabase/migrations/20260921_vuelos_baratos.sql`; el resto son las formas
 * que consumen las páginas (pares de fechas, agregados y filtros del
 * explorador).
 */

export type Haul = 'short' | 'medium' | 'long'

export interface LandingDestinationRow {
  code: string
  slug: string
  name: string
  /** Código de destino de Travel Compositor; NO es el IATA del aeropuerto. */
  tc_code: string
  iata_display: string | null
  haul: Haul
  seo_title: string | null
  seo_description: string | null
  hero_image_url: string | null
  faq: Array<{ q: string; a: string }>
  active: boolean
  sort_order: number
}

export interface LandingRouteRow {
  id: number
  destination_code: string
  origin_tc_code: string
  origin_name: string
  stay_nights: number[]
  /** ISO: 1 = lunes … 7 = domingo. */
  weekdays: number[]
  probes_per_month: number
  /** Pares por mes que estima Sabre (BFM) cada noche; 0 = ruta sin estimador. */
  scan_per_month: number
  /** De los estimados, cuántos por mes confirma siviajo.com con una sonda. */
  confirm_per_month: number
  months_ahead: number
  active: boolean
}

/** Fila de `flight_price_probes` con las columnas que usa la landing. */
export interface ProbeRow {
  id: number
  route_id: number | null
  origin: string
  destination: string
  destination_code: string | null
  departure_date: string
  return_date: string | null
  nights: number | null
  adults: number
  price_per_pax: number | null
  currency: string
  airline: string | null
  airline_code: string | null
  stops: number | null
  stops_back: number | null
  direct: boolean | null
  duration_minutes: number | null
  duration_back_minutes: number | null
  fare_family: string | null
  checked_bag: boolean | null
  carry_on: boolean | null
  /** Opcional: las lecturas de la landing no piden esta columna. */
  options?: unknown[] | null
  status: 'ok' | 'empty' | 'error' | 'timeout'
  source: string
  job_id: number | null
  probed_at: string
}

/**
 * Fila de `flight_fare_estimates`: lo que Sabre estimó para un par de fechas.
 *
 * NUNCA es un precio publicable (sale del PCC propio, sin el markup ni las
 * reglas del motor): sólo ordena qué fechas vale la pena confirmar y, en la
 * landing, se muestra como "≈ US$ X".
 */
export interface EstimateRow {
  id: number
  route_id: number
  depart_date: string
  return_date: string
  price_pp: number
  currency: string
  airline_code: string | null
  stops_out: number | null
  stops_back: number | null
  duration_out_minutes: number | null
  duration_back_minutes: number | null
  observed_at: string
}

/** Fila a insertar en `flight_fare_estimates` (el id lo pone la base). */
export type EstimateInsert = Omit<EstimateRow, 'id'> & {
  /** Los ≤5 itinerarios que devolvió el BFM, resumidos. */
  itineraries?: unknown[]
  source?: string
  job_id?: number | null
  elapsed_ms?: number | null
}

export interface DatePair {
  depart: string
  return: string
  nights: number
}

/** La mejor observación vigente para un par de fechas. */
export interface BestPair {
  probeId: number
  routeId: number | null
  depart: string
  return: string
  nights: number
  pricePp: number
  currency: string
  airline: string | null
  airlineCode: string | null
  stopsOut: number | null
  stopsBack: number | null
  durationOutMin: number | null
  durationBackMin: number | null
  fareFamily: string | null
  checkedBag: boolean | null
  carryOn: boolean | null
  observedAt: string
}

export interface MonthSummary {
  month: string
  label: string
  minPrice: number | null
  pairs: number
}

export interface DestinationSummary {
  code: string
  slug: string
  name: string
  originCode: string
  routeId: number
  minPrice: number | null
  observedAt: string | null
  pairs: number
}

export type SortKey = 'price' | 'depart' | 'return' | 'nights' | 'duration' | 'stops' | 'airline'

export interface ExplorerFilters {
  month?: string
  stops?: 0 | 1 | 2
  direct?: boolean
  stayMin?: number
  stayMax?: number
  departFrom?: string
  departTo?: string
  returnFrom?: string
  returnTo?: string
  departDow?: number[]
  returnDow?: number[]
  priceMin?: number
  priceMax?: number
  airlines?: string[]
  sort: SortKey
  dir: 'asc' | 'desc'
  page: number
}

export interface EstimateSummary {
  pairs: number
  ok: number
  empty: number
  errors: number
  minPrice: number | null
  durationMs: number
  budgetStopped: boolean
  /** Búsquedas BFM que se le pidieron a Sabre (una por par intentado). */
  sabreCalls: number
  /**
   * Error que corta el job entero y no se reintenta: credenciales rechazadas o
   * un origen sin IATA mapeado. Seguir pidiendo pares no lo arregla.
   */
  fatalError: string | null
}

export interface SweepSummary {
  probes: number
  ok: number
  empty: number
  errors: number
  timeouts: number
  minPrice: number | null
  durationMs: number
  budgetStopped: boolean
}
