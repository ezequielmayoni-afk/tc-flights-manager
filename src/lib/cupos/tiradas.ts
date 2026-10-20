import type { ProbeOption } from '@/lib/cotizador/client'
import { airlineKey, analyzeAirlines, bestByAirline, optionsForAirline, type AirlineDecision, type AirlineHistory, type DateOptions } from './airline-analysis'
import { addDays, optionIsDirect, pickOptionForDate, rankOptions } from './requests'

/**
 * De las opciones sondeadas por fecha a las tiradas del pedido. Lo usan el
 * sondeo (cupo.probe) y el cambio manual de aerolínea (sin volver a sondear).
 */

export type DateWithMarket = DateOptions & { airlinePref?: string[]; market?: { pp: number; sources: string[] } | null }

export interface StoredAnalysis {
  version: 1; at: string; singleAirline: boolean; chosen: string | null; chosenName: string | null; reason: string; manual?: boolean
  stats: AirlineDecision['stats']; intel: unknown
  dates: Array<{ date: string; nights: number; group: number | null; groupLabel: string | null; seats: number; directOnly: boolean; airlinePref: string[]; market: { pp: number; sources: string[] } | null; options: ProbeOption[] }>
}

export function tiradaRow(requestId: number, d: DateWithMarket, o: ProbeOption, legacy: boolean) {
  const now = new Date().toISOString()
  return {
    request_id: requestId, departure_date: d.date, return_date: addDays(d.date, d.nights), nights: d.nights, airline: o.airline || null, airline_code: airlineKey(o) || null,
    flight_out: o.flightOut || null, flight_back: o.flightBack || null, depart_out: o.departOut || null, arrive_out: o.arriveOut || null, depart_back: o.departBack || null, arrive_back: o.arriveBack || null,
    stops_out: o.stopsOut, stops_back: o.stopsBack, direct: optionIsDirect(o), fare_family: o.fareFamily || null, checked_bag: o.checkedBag, seats: d.seats,
    system_price_pp: o.pricePp, system_currency: o.currency || 'USD', system_probed_at: now, probe_options: d.options.slice(0, 10), status: 'probed', updated_at: now,
    market_price_pp: d.market?.pp ?? null, market_source: d.market?.sources?.join('+') ?? null,
    probe_group: legacy ? null : d.group, probe_group_label: legacy ? null : d.groupLabel,
  }
}
export type TiradaRow = ReturnType<typeof tiradaRow>

/** Ordena: pedido viejo = las N más baratas; con sondeos = por sondeo y, dentro, por precio. */
function order(rows: TiradaRow[], legacy: boolean, maxOptions: number): TiradaRow[] {
  if (legacy) return rankOptions(rows).slice(0, Math.max(maxOptions, 3))
  const groups = [...new Set(rows.map(r => r.probe_group ?? -1))].sort((a, b) => a - b)
  return groups.flatMap(g => rankOptions(rows.filter(r => (r.probe_group ?? -1) === g)))
}

/**
 * Arma las tiradas. Con `singleAirline` elige una aerolínea para todo el pedido
 * (o usa `forceAirline`) y toma su mejor opción en cada fecha; sin eso, cada
 * fecha toma la más barata que cumpla lo pedido (comportamiento anterior).
 */
export function buildTiradas(input: { requestId: number; legacy: boolean; maxOptions: number; singleAirline: boolean; dates: DateWithMarket[]; prefs: string[]; history?: Map<string, AirlineHistory>; forceAirline?: string | null }): { rows: TiradaRow[]; decision: AirlineDecision | null } {
  const { requestId, legacy, dates } = input
  if (!input.singleAirline) {
    const rows = dates.flatMap(d => { const o = pickOptionForDate(d.options, { directOnly: d.directOnly, airlinePref: d.airlinePref ?? [] }); return o ? [tiradaRow(requestId, d, o, legacy)] : [] })
    return { rows: order(rows, legacy, input.maxOptions), decision: dates.length ? analyzeAirlines(dates, { prefs: input.prefs, history: input.history }) : null }
  }
  const decision = analyzeAirlines(dates, { prefs: input.prefs, history: input.history })
  const code = input.forceAirline ?? decision.chosen
  if (!code) return { rows: [], decision }
  if (input.forceAirline && input.forceAirline !== decision.chosen) {
    const s = decision.stats.find(x => x.code === code)
    decision.chosen = code; decision.chosenName = s?.name ?? code
    decision.reason = `Elegida a mano: ${s?.name ?? code}${s ? ` (${s.covered}/${s.total} fechas, promedio USD ${s.avgPp})` : ''}.`
  }
  const rows = optionsForAirline(dates, code).map(({ d, option }) => tiradaRow(requestId, d as DateWithMarket, option, legacy))
  return { rows: order(rows, legacy, input.maxOptions), decision }
}

/** Lo que se guarda en `cupo_requests.airline_analysis`. */
export function storeAnalysis(dates: DateWithMarket[], decision: AirlineDecision | null, singleAirline: boolean, intel: unknown, manual = false): StoredAnalysis {
  return {
    version: 1, at: new Date().toISOString(), singleAirline, manual, chosen: decision?.chosen ?? null, chosenName: decision?.chosenName ?? null, reason: decision?.reason ?? '', stats: decision?.stats ?? [], intel,
    dates: dates.map(d => ({ date: d.date, nights: d.nights, group: d.group, groupLabel: d.groupLabel, seats: d.seats, directOnly: d.directOnly, airlinePref: d.airlinePref ?? [], market: d.market ?? null, options: [...new Set([...bestByAirline(d.options, false).values(), ...bestByAirline(d.options, true).values()])] })),
  }
}

/** Reconstruye las fechas desde el análisis guardado (para cambiar de aerolínea sin sondear). */
export function datesFromStored(a: StoredAnalysis): DateWithMarket[] {
  return a.dates.map(d => ({ date: d.date, nights: d.nights, group: d.group, groupLabel: d.groupLabel, seats: d.seats, directOnly: d.directOnly, airlinePref: d.airlinePref, market: d.market, options: d.options ?? [] }))
}
