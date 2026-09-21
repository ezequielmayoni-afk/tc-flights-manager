import { getCupoPackageIds } from '@/lib/packages/cupo'
import { aggregatePackageCupos, findFlightsForPackages } from '@/lib/packages/flight-match'
import { loadProfiles } from '@/lib/producto/profiles'
import type { Db } from '@/lib/jobs/types'
import { DEFAULT_FAMILY_WEIGHTS, DEFAULT_RULES, evaluatePackage, type CriteriaContext, type CriteriaPackage, type Evaluation, type MarketingRules, type MarketingTrack } from './criteria'

/**
 * Junta lo que el score necesita (cupos, margen, tendencias, temporada,
 * canibalización) para un lote de paquetes y lo evalúa. `apply` escribe la
 * recomendación en `packages` sin pisar lo que decidió una persona.
 */

export async function loadRules(db: Db): Promise<MarketingRules> {
  const { data } = await db.from('marketing_rules').select('*').eq('id', 1).maybeSingle()
  if (!data) return DEFAULT_RULES
  const r = data as Record<string, unknown>
  const num = (v: unknown, d: number) => (typeof v === 'number' ? v : Number(v)) || d
  return {
    weights: { ...DEFAULT_RULES.weights, ...((r.weights as Record<string, number> | null) ?? {}) },
    marketingMin: num(r.marketing_min, DEFAULT_RULES.marketingMin),
    manualMin: num(r.manual_min, DEFAULT_RULES.manualMin),
    marginGoodPct: num(r.margin_good_pct, DEFAULT_RULES.marginGoodPct),
    marginGreatPct: num(r.margin_great_pct, DEFAULT_RULES.marginGreatPct),
    marginBadPct: num(r.margin_bad_pct, DEFAULT_RULES.marginBadPct),
    minDaysToDeparture: num(r.min_days_to_departure, DEFAULT_RULES.minDaysToDeparture),
    cupoMinSeats: num(r.cupo_min_seats, DEFAULT_RULES.cupoMinSeats),
    cupoWindowFromDays: num(r.cupo_window_from_days, DEFAULT_RULES.cupoWindowFromDays),
    cupoWindowToDays: num(r.cupo_window_to_days, DEFAULT_RULES.cupoWindowToDays),
    maxInMarketingPerDestination: num(r.max_in_marketing_per_destination, DEFAULT_RULES.maxInMarketingPerDestination),
    ticketLowUsd: num(r.ticket_low_usd, DEFAULT_RULES.ticketLowUsd),
    ticketHighUsd: num(r.ticket_high_usd, DEFAULT_RULES.ticketHighUsd),
    familyWeights: { ...DEFAULT_FAMILY_WEIGHTS, ...((r.family_weights as Record<string, number> | null) ?? {}) },
    autoApprove: r.auto_approve === true,
  }
}

interface PackageRow {
  id: number; tc_package_id: number; title: string; status: string | null; tc_active: boolean; needs_manual_quote: boolean | null
  current_price_per_pax: number | string | null; total_price: number | string | null; air_cost: number | string | null; land_cost: number | string | null; agency_fee: number | string | null
  departure_date: string | null; flight_departure_date: string | null; date_range_end: string | null; send_to_marketing: boolean | null; marketing_status: string | null
  destination_profile_code: string | null; profile_violations: unknown[] | null; marketing_track: MarketingTrack | null; marketing_track_decided_by: string | null
  package_destinations: Array<{ destination_code: string | null; destination_name: string | null; sort_order: number | null }> | null
}

export interface PackageEvaluation {
  packageId: number
  tcPackageId: number
  title: string
  previousTrack: MarketingTrack | null
  decidedBy: string | null
  inMarketing: boolean
  evaluation: Evaluation
  context: Pick<CriteriaContext, 'cupo' | 'operatorDeparture' | 'family' | 'trend' | 'momentum' | 'inMarketingSameDestination'>
}

const n = (v: number | string | null | undefined): number | null => (v === null || v === undefined ? null : Number(v))
const TREND_PRIORITY: Record<string, number> = { opportunity: 3, gap: 2, saturated: 1, declining: 0 }
const MOMENTUM_PRIORITY: Record<string, number> = { surging: 4, rising: 3, new: 2, stable: 1, falling: 0 }

/** Clasificación y momentum del destino según la última corrida de Tendencias, por paquete. */
async function loadTrendByPackage(db: Db): Promise<Map<number, { trend: CriteriaContext['trend']; momentum: CriteriaContext['momentum'] }>> {
  const map = new Map<number, { trend: CriteriaContext['trend']; momentum: CriteriaContext['momentum'] }>()
  const { data: run } = await db.from('trend_runs').select('id').eq('status', 'completed').order('completed_at', { ascending: false }).limit(1).maybeSingle()
  if (!run) return map
  const { data: rows } = await db.from('trend_destinations').select('classification, momentum, matching_package_ids').eq('trend_run_id', (run as { id: string }).id).not('matching_package_ids', 'is', null)
  for (const r of (rows ?? []) as Array<{ classification: string | null; momentum: string | null; matching_package_ids: number[] | null }>) {
    for (const pid of r.matching_package_ids ?? []) {
      const cur = map.get(pid)
      const better = !cur
        || (TREND_PRIORITY[r.classification ?? ''] ?? -1) > (TREND_PRIORITY[cur.trend ?? ''] ?? -1)
        || ((TREND_PRIORITY[r.classification ?? ''] ?? -1) === (TREND_PRIORITY[cur.trend ?? ''] ?? -1) && (MOMENTUM_PRIORITY[r.momentum ?? ''] ?? -1) > (MOMENTUM_PRIORITY[cur.momentum ?? ''] ?? -1))
      if (better) map.set(pid, { trend: (r.classification as CriteriaContext['trend']) ?? null, momentum: (r.momentum as CriteriaContext['momentum']) ?? null })
    }
  }
  return map
}

export async function evaluatePackages(db: Db, options: { packageIds?: number[]; today?: string; rules?: MarketingRules; /** Ignora que ya esté en marketing: mide qué diría el score solo. */ blind?: boolean } = {}): Promise<{ rules: MarketingRules; results: PackageEvaluation[] }> {
  const rules = options.rules ?? await loadRules(db)
  const today = options.today ?? new Date().toISOString().slice(0, 10)
  let query = db.from('packages').select('id, tc_package_id, title, status, tc_active, needs_manual_quote, current_price_per_pax, total_price, air_cost, land_cost, agency_fee, departure_date, flight_departure_date, date_range_end, send_to_marketing, marketing_status, destination_profile_code, profile_violations, marketing_track, marketing_track_decided_by, package_destinations(destination_code, destination_name, sort_order)')
  if (options.packageIds?.length) query = query.in('id', options.packageIds)
  else query = query.eq('tc_active', true).not('status', 'in', '("expired","not_visible")')
  const { data, error } = await query
  if (error) throw new Error(`No se pudieron leer los paquetes: ${error.message}`)
  const rows = (data ?? []) as unknown as PackageRow[]
  if (rows.length === 0) return { rules, results: [] }

  const ids = rows.map(r => r.id)
  const [cupoIds, profiles, trendByPackage] = await Promise.all([getCupoPackageIds(db, ids), loadProfiles(db), loadTrendByPackage(db)])
  const flightsByPackage = cupoIds.size > 0 ? await findFlightsForPackages(db, [...cupoIds]) : new Map()

  // Canibalización: paquetes en marketing por destino principal, contando todo el catálogo activo (no sólo el lote).
  const { data: mk } = await db.from('packages').select('id, package_destinations(destination_code, sort_order)').eq('tc_active', true).or('send_to_marketing.eq.true,status.eq.in_marketing')
  const inMarketingByDest = new Map<string, Set<number>>()
  for (const p of (mk ?? []) as Array<{ id: number; package_destinations: Array<{ destination_code: string | null; sort_order: number | null }> | null }>) {
    const code = [...(p.package_destinations ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.destination_code?.toUpperCase()
    if (!code) continue
    if (!inMarketingByDest.has(code)) inMarketingByDest.set(code, new Set())
    inMarketingByDest.get(code)!.add(p.id)
  }

  const results: PackageEvaluation[] = []
  for (const r of rows) {
    const dests = [...(r.package_destinations ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    const codes = dests.map(d => d.destination_code?.toUpperCase() ?? '').filter(Boolean)
    const profile = (r.destination_profile_code && profiles.find(p => p.code === r.destination_profile_code))
      || profiles.find(p => codes.length > 0 && (p.tc_destination_code?.toUpperCase() === codes[0] || p.code.toUpperCase() === codes[0] || p.iata_airport?.toUpperCase() === codes[0]))
      || null
    const inMarketing = r.send_to_marketing === true || r.status === 'in_marketing'
    const matches = cupoIds.has(r.id) ? (flightsByPackage.get(r.id) ?? []) : []
    const cupo = matches.length > 0 ? (() => { const agg = aggregatePackageCupos(matches); return { remaining: agg.remaining, total: agg.total } })() : null
    // Aéreo de contrato sin cupo cargado en HUB = salida grupal / charter del operador.
    const operatorDeparture = cupoIds.has(r.id) && matches.length === 0
    const trend = trendByPackage.get(r.id) ?? { trend: null, momentum: null }
    const sameDest = codes[0] ? (inMarketingByDest.get(codes[0])?.size ?? 0) - (inMarketing && inMarketingByDest.get(codes[0])?.has(r.id) ? 1 : 0) : 0
    const pkg: CriteriaPackage = {
      id: r.id, tcPackageId: r.tc_package_id, title: r.title, status: r.status, tcActive: r.tc_active, needsManualQuote: r.needs_manual_quote === true,
      pricePerPax: n(r.current_price_per_pax), totalPrice: n(r.total_price), airCost: n(r.air_cost), landCost: n(r.land_cost), agencyFee: n(r.agency_fee),
      departureDate: r.flight_departure_date ?? r.departure_date, dateRangeEnd: r.date_range_end, destinationCodes: codes, profileViolations: r.profile_violations, inMarketing: options.blind ? false : inMarketing,
    }
    const context: CriteriaContext = { today, cupo, operatorDeparture, family: profile?.family ?? null, trend: trend.trend, momentum: trend.momentum, highSeasonMonths: profile?.high_season_months ?? null, bookingWindowDays: profile?.booking_window_days ?? null, inMarketingSameDestination: Math.max(0, sameDest) }
    results.push({ packageId: r.id, tcPackageId: r.tc_package_id, title: r.title, previousTrack: r.marketing_track ?? null, decidedBy: r.marketing_track_decided_by ?? null, inMarketing, evaluation: evaluatePackage(pkg, context, rules), context: { cupo, operatorDeparture, family: context.family, trend: trend.trend, momentum: trend.momentum, inMarketingSameDestination: context.inMarketingSameDestination } })
  }
  return { rules, results }
}

/** Escribe score, vía y motivo. Una vía decidida por una persona no se pisa (sí se actualizan score y motivo). */
export async function applyEvaluations(db: Db, results: PackageEvaluation[]): Promise<{ updated: number; changed: number; byTrack: Record<string, number> }> {
  const now = new Date().toISOString()
  const byTrack: Record<string, number> = {}
  let updated = 0
  let changed = 0
  for (const r of results) {
    const e = r.evaluation
    const keepHuman = r.decidedBy !== null && r.previousTrack !== null && r.previousTrack !== 'undecided' && e.track !== 'excluded'
    const track = keepHuman ? r.previousTrack! : e.track
    byTrack[track] = (byTrack[track] ?? 0) + 1
    if (track !== r.previousTrack) changed++
    const { error } = await db.from('packages').update({
      marketing_track: track, marketing_score: e.score, marketing_track_reason: e.reasons.join(' · '),
      marketing_score_details: { components: e.components, marginPct: e.marginPct, daysToDeparture: e.daysToDeparture, cupo: r.context.cupo, operatorDeparture: r.context.operatorDeparture, family: r.context.family, trend: r.context.trend, momentum: r.context.momentum, sameDestinationInMarketing: r.context.inMarketingSameDestination, recommended: e.track, keptHumanDecision: keepHuman },
      marketing_evaluated_at: now,
    }).eq('id', r.packageId)
    if (!error) updated++
  }
  return { updated, changed, byTrack }
}
