/**
 * Criterio marketing vs web: puntaje por paquete con reglas editables.
 * Puro: sin red ni base. Los pesos y umbrales viven en `marketing_rules`.
 *
 * Idea: un paquete va a marketing (anuncios pagos) cuando junta señales de
 * que vale la plata: cupo propio que hay que vender, margen, destino en
 * tendencia, temporada alta dentro de la ventana de compra, calendario de
 * compra caliente. Se penaliza la canibalización (ya hay varios del mismo
 * destino en marketing), la salida demasiado cercana y las violaciones al
 * perfil. Lo que no se puede vender (dado de baja, sin precio, cotización
 * manual pendiente) queda excluido.
 */

export type MarketingTrack = 'undecided' | 'web' | 'marketing' | 'manual' | 'excluded'

export interface MarketingRules {
  weights: Record<string, number>
  marketingMin: number
  manualMin: number
  marginGoodPct: number
  marginGreatPct: number
  marginBadPct: number
  minDaysToDeparture: number
  cupoMinSeats: number
  cupoWindowFromDays: number
  cupoWindowToDays: number
  maxInMarketingPerDestination: number
  /** Ticket por pasajero (USD) por debajo del cual la pauta no se paga, y por encima del cual conviene. */
  ticketLowUsd: number
  ticketHighUsd: number
  /** Peso por familia del destino (caribe, brasil, argentina…): lo que históricamente rinde en pauta. */
  familyWeights: Record<string, number>
  autoApprove: boolean
}

export const DEFAULT_WEIGHTS: Record<string, number> = {
  cupo: 25, cupo_risk: 15, grupal: 20, margin_good: 15, margin_great: 5, margin_bad: -20,
  trend_opportunity: 15, trend_rising: 5, trend_declining: -10, high_season: 10, hot_window: 10,
  ticket_low: -15, ticket_high: 0, cannibalization: -15, too_close: -25, profile_violation: -30,
}

/** Calibrado el 2026-09-21 contra las 28 decisiones a mano del catálogo (27 quedan en marketing o para decidir). */
export const DEFAULT_FAMILY_WEIGHTS: Record<string, number> = { caribe: 15, brasil: 5, argentina: -10 }

export const DEFAULT_RULES: MarketingRules = {
  weights: DEFAULT_WEIGHTS, marketingMin: 55, manualMin: 20, marginGoodPct: 10, marginGreatPct: 12, marginBadPct: 6,
  minDaysToDeparture: 21, cupoMinSeats: 6, cupoWindowFromDays: 30, cupoWindowToDays: 150, maxInMarketingPerDestination: 3,
  ticketLowUsd: 700, ticketHighUsd: 1800, familyWeights: DEFAULT_FAMILY_WEIGHTS, autoApprove: false,
}

export interface CriteriaPackage {
  id: number
  tcPackageId: number
  title: string
  status: string | null
  tcActive: boolean
  needsManualQuote: boolean
  pricePerPax: number | null
  totalPrice: number | null
  airCost: number | null
  landCost: number | null
  agencyFee: number | null
  departureDate: string | null
  /** Fin del rango de fechas vendibles (paquetes de sistema); null en cupos. */
  dateRangeEnd: string | null
  destinationCodes: string[]
  profileViolations: unknown[] | null
  /** Ya está (o estuvo) en marketing: la decisión existe. */
  inMarketing: boolean
}

export interface CriteriaContext {
  today: string
  /** null si el paquete no es de cupo. */
  cupo: { remaining: number; total: number } | null
  /** Salida grupal o charter de operador: aéreo de contrato sin cupo cargado en HUB. */
  operatorDeparture: boolean
  /** Familia del perfil del destino (caribe, brasil, usa, europa, medio_oriente_asia, argentina) o null. */
  family: string | null
  trend: 'opportunity' | 'gap' | 'saturated' | 'declining' | null
  momentum: 'surging' | 'rising' | 'stable' | 'falling' | 'new' | null
  highSeasonMonths: number[] | null
  bookingWindowDays: number | null
  /** Otros paquetes del mismo destino que ya están en marketing. */
  inMarketingSameDestination: number
}

export interface Evaluation {
  score: number
  track: MarketingTrack
  reasons: string[]
  components: Record<string, number>
  excludedBecause: string | null
  marginPct: number | null
  daysToDeparture: number | null
}

const parse = (s: string) => new Date(`${s}T00:00:00Z`)
const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86400000)

/** Margen del paquete: la fee de agencia sobre el total; si no hay fee, total menos costos. */
export function marginPct(pkg: Pick<CriteriaPackage, 'totalPrice' | 'airCost' | 'landCost' | 'agencyFee'>): number | null {
  const total = pkg.totalPrice ?? null
  if (!total || total <= 0) return null
  if (pkg.agencyFee !== null && pkg.agencyFee !== undefined && pkg.agencyFee > 0) return Math.round((pkg.agencyFee / total) * 1000) / 10
  // Sin fee y sin aéreo desglosado (TC mete todo en land_cost en los cupos de contrato) el margen no se conoce.
  if (!pkg.airCost || !pkg.landCost || pkg.airCost <= 0 || pkg.landCost <= 0) return null
  return Math.round(((total - pkg.airCost - pkg.landCost) / total) * 1000) / 10
}

/**
 * Calendario de compra del argentino: aguinaldo (20 jun–15 jul), Travel Sale
 * (agosto), fin de año (10–30 dic) y las quincenas (días 1–5 y 15–20).
 */
export function isHotWindow(today: string): boolean {
  const d = parse(today)
  const m = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  if ((m === 6 && day >= 20) || (m === 7 && day <= 15)) return true
  if (m === 8) return true
  if (m === 12 && day >= 10 && day <= 30) return true
  return (day >= 1 && day <= 5) || (day >= 15 && day <= 20)
}

export function evaluatePackage(pkg: CriteriaPackage, ctx: CriteriaContext, rules: MarketingRules = DEFAULT_RULES): Evaluation {
  const w = { ...DEFAULT_WEIGHTS, ...rules.weights }
  const components: Record<string, number> = {}
  const reasons: string[] = []
  const days = pkg.departureDate ? daysBetween(ctx.today, pkg.departureDate) : null
  // Hasta cuándo se puede vender: el cupo sale un día fijo; el paquete de sistema se recotiza dentro de su rango.
  const horizonDate = ctx.cupo === null && pkg.dateRangeEnd && (!pkg.departureDate || pkg.dateRangeEnd > pkg.departureDate) ? pkg.dateRangeEnd : pkg.departureDate
  const horizonDays = horizonDate ? daysBetween(ctx.today, horizonDate) : null
  const margin = marginPct(pkg)

  // Exclusiones duras: no se puede vender, no se pauta.
  let excludedBecause: string | null = null
  if (!pkg.tcActive) excludedBecause = 'Dado de baja en TC'
  else if (pkg.status === 'expired' || pkg.status === 'not_visible') excludedBecause = pkg.status === 'expired' ? 'Vencido' : 'No visible'
  else if (pkg.needsManualQuote) excludedBecause = 'Cotización manual pendiente'
  else if (!pkg.pricePerPax || pkg.pricePerPax <= 0) excludedBecause = 'Sin precio'
  else if (horizonDays !== null && horizonDays < 0) excludedBecause = horizonDate === pkg.departureDate ? 'La salida ya pasó' : 'El rango de fechas ya venció'
  if (excludedBecause) {
    return { score: -100, track: 'excluded', reasons: [excludedBecause], components: { excluded: -100 }, excludedBecause, marginPct: margin, daysToDeparture: days }
  }

  // Cupo propio que hay que vender.
  if (ctx.cupo && ctx.cupo.total > 0) {
    if (ctx.cupo.remaining >= rules.cupoMinSeats && days !== null && days >= rules.cupoWindowFromDays && days <= rules.cupoWindowToDays) {
      components.cupo = w.cupo; reasons.push(`Cupo con ${ctx.cupo.remaining} lugares a ${days} días`)
    } else if (ctx.cupo.remaining <= 0) {
      reasons.push('Cupo agotado')
    } else {
      reasons.push(`Cupo con ${ctx.cupo.remaining} lugares${days !== null ? ` a ${days} días` : ''}, fuera de la ventana de pauta`)
    }
    const unsoldPct = ctx.cupo.remaining / ctx.cupo.total
    if (ctx.cupo.remaining > 0 && unsoldPct > 0.4 && days !== null && days <= 60) {
      components.cupo_risk = w.cupo_risk; reasons.push(`Riesgo: ${Math.round(unsoldPct * 100)}% del cupo sin vender a ${days} días`)
    }
  }
  if (ctx.operatorDeparture && !(ctx.cupo && ctx.cupo.total > 0)) { components.grupal = w.grupal; reasons.push('Salida grupal / charter de operador') }

  // Margen.
  if (margin === null) {
    reasons.push('Margen desconocido (TC no desglosa el costo del aéreo)')
  } else if (margin >= rules.marginGreatPct) {
    components.margin_good = w.margin_good; components.margin_great = w.margin_great; reasons.push(`Margen ${margin}%`)
  } else if (margin >= rules.marginGoodPct) {
    components.margin_good = w.margin_good; reasons.push(`Margen ${margin}%`)
  } else if (margin < rules.marginBadPct) {
    components.margin_bad = w.margin_bad; reasons.push(`Margen bajo: ${margin}%`)
  } else {
    reasons.push(`Margen ${margin}% (justo)`)
  }

  // Ticket por pasajero: con USD 400 de ticket la pauta no se paga.
  if (pkg.pricePerPax !== null && pkg.pricePerPax < rules.ticketLowUsd) { components.ticket_low = w.ticket_low; reasons.push(`Ticket bajo (USD ${Math.round(pkg.pricePerPax)}): la pauta no se paga`) }
  else if (pkg.pricePerPax !== null && pkg.pricePerPax >= rules.ticketHighUsd && w.ticket_high) { components.ticket_high = w.ticket_high; reasons.push(`Ticket alto (USD ${Math.round(pkg.pricePerPax)})`) }

  // Familia del destino: lo que históricamente rinde en pauta.
  if (ctx.family && rules.familyWeights[ctx.family]) { components.family = rules.familyWeights[ctx.family]; reasons.push(`${rules.familyWeights[ctx.family] > 0 ? 'Familia que rinde en pauta' : 'Familia que no suele ir a pauta'}: ${ctx.family}`) }

  // Tendencia del destino (última corrida de Tendencias).
  if (ctx.trend === 'opportunity') { components.trend_opportunity = w.trend_opportunity; reasons.push('Destino en oportunidad según Tendencias') }
  else if (ctx.trend === 'declining') { components.trend_declining = w.trend_declining; reasons.push('Destino en baja según Tendencias') }
  if (ctx.trend !== 'declining' && (ctx.momentum === 'rising' || ctx.momentum === 'surging')) { components.trend_rising = w.trend_rising; reasons.push(`Búsquedas del destino ${ctx.momentum === 'surging' ? 'disparadas' : 'en alza'}`) }

  // Temporada alta del perfil dentro de la ventana de compra.
  if (pkg.departureDate && ctx.highSeasonMonths && ctx.highSeasonMonths.length > 0) {
    const month = parse(pkg.departureDate).getUTCMonth() + 1
    if (ctx.highSeasonMonths.includes(month) && (ctx.bookingWindowDays === null || (days !== null && days <= ctx.bookingWindowDays))) {
      components.high_season = w.high_season; reasons.push('Sale en temporada alta y ya está en ventana de compra')
    }
  }

  // Calendario de compra caliente.
  if (isHotWindow(ctx.today)) { components.hot_window = w.hot_window; reasons.push('Ventana de compra caliente') }

  // Canibalización.
  if (ctx.inMarketingSameDestination >= rules.maxInMarketingPerDestination) {
    components.cannibalization = w.cannibalization; reasons.push(`Ya hay ${ctx.inMarketingSameDestination} del mismo destino en marketing`)
  }

  // Muy cerca de la salida: no alcanza para diseño y aprendizaje.
  if (horizonDays !== null && horizonDays < rules.minDaysToDeparture) { components.too_close = w.too_close; reasons.push(horizonDate === pkg.departureDate ? `Sale en ${horizonDays} días: no llega diseño ni aprendizaje` : `Se vende sólo hasta el ${horizonDate} (${horizonDays} días): no llega diseño ni aprendizaje`) }

  // Viola el perfil del destino.
  if (pkg.profileViolations && pkg.profileViolations.length > 0) { components.profile_violation = w.profile_violation; reasons.push(`Viola el perfil del destino (${pkg.profileViolations.length})`) }

  const score = Math.max(-100, Math.min(100, Math.round(Object.values(components).reduce((a, b) => a + b, 0))))
  let track: MarketingTrack = score >= rules.marketingMin ? 'marketing' : score >= rules.manualMin ? 'manual' : 'web'
  if (pkg.inMarketing) { track = 'marketing'; reasons.unshift('Ya está en marketing') }
  return { score, track, reasons, components, excludedBecause: null, marginPct: margin, daysToDeparture: days }
}
