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
  options: unknown[] | null
  status: 'ok' | 'empty' | 'error' | 'timeout'
  source: string
  job_id: number | null
  probed_at: string
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
