/**
 * Tipos del módulo Producto (Fase 3): perfiles de destino, sondas de fechas,
 * ideas de paquete. Los perfiles son "usos y costumbres": lo que SiViajo
 * sabe de cómo se vende cada destino. Ninguna idea llega a siviajo.com sin
 * pasar por ellos.
 */

export type Family = 'caribe' | 'brasil' | 'usa' | 'europa' | 'medio_oriente_asia' | 'argentina' | 'sudamerica'

export type Regimen = 'all_inclusive' | 'media_pension' | 'desayuno' | 'sin_pension'

export interface StopoverModifiers {
  /** Puntos que se suman al umbral cuando el viaje es corto (≤ 5 noches). */
  short_trip: number
  /** Puntos que se suman cuando viajan menores. */
  kids: number
  /** Puntos que se suman si la escala implica pernocte. */
  overnight: number
  /** Puntos que se restan si el origen es del interior (ya asume conexión). */
  origin_interior: number
  /** Factor del umbral cuando el vuelo es "medio directo" (una escala corta sin cambio de avión). */
  half_direct: number
}

export interface DestinationProfile {
  code: string
  name: string
  aliases: string[]
  family: Family
  tc_destination_code: string | null
  iata_airport: string | null
  regimen_required: Regimen | null
  regimen_allowed: Regimen[]
  nights_default: number
  nights_allowed: number[]
  stars_default: number
  stars_min: number
  high_season_months: number[]
  booking_window_days: number
  /** Ahorro mínimo (%) para aceptar escala en vez de directo. null = no hay directos: manda el precio. */
  stopover_threshold_pct: number | null
  stopover_modifiers: StopoverModifiers
  /** Aerolíneas habituales por origen (EZE, COR, ROS…). */
  airlines_by_origin: Record<string, string[]>
  themes_default: string[]
  direct_required: boolean
  auto_publish: boolean
  auto_requote: boolean
  price_tolerance_pct: number
  active: boolean
}

/** Una celda del calendario de precios: qué cuesta salir tal día. */
export interface FareCell {
  date: string
  pricePerPax: number
  currency: string
  direct: boolean
  durationMinutes: number | null
  airline: string | null
  flightNumbers?: string[]
  stops?: number
  overnightStop?: boolean
  source: 'tc_search' | 'sabre' | 'serpapi' | 'cotizador_probe' | 'manual'
}

export interface StopoverContext {
  nights: number
  hasKids: boolean
  originInterior: boolean
}

export interface StopoverDecision {
  choice: 'direct' | 'stopover' | 'only_option'
  thresholdPct: number | null
  savingsPct: number | null
  reason: string
}

export interface DatePick {
  chosen: FareCell
  alternatives: FareCell[]
  stopover: StopoverDecision
  reason: string
  /** Precio ajustado por duración: precio + USD por hora sobre el vuelo más corto. */
  adjustedPrice: number
}

export interface IdeaDraft {
  destinationCode: string
  origin: string
  month: string
  nights: number
  adults: number
  children: number
  regimen: Regimen | null
  starsMin: number | null
  directFlight: boolean | null
  departureDate?: string | null
}

export interface IdeaValidation {
  ok: boolean
  /** Bloquean: la idea no se cotiza ni se guarda. */
  hard: string[]
  /** Avisan: se cotiza pero queda en needs_review. */
  soft: string[]
}
