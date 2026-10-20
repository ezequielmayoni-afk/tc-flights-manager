import type { Db } from '@/lib/jobs/types'
import type { ProbeOption } from '@/lib/cotizador/client'
import { airlineKey, median, type AirlineHistory } from './airline-analysis'

/**
 * Lo que HUB ya sabe de una ruta antes de sondear, con toda la metadata de
 * vuelos.siviajo: sondas del cotizador (con todas sus opciones), estimaciones de
 * Sabre, búsquedas reales en siviajo.com y cotizaciones del bot del CRM.
 * Se cruza por aeropuerto de llegada (Maceió y Maragogi comparten MCZ).
 */

export interface RouteIntel {
  airport: string | null
  keys: string[]
  history: AirlineHistory[]
  demand: { botQuotes: number; webSearches: number; byMonth: Record<string, { botQuotes: number; webSearches: number }>; topDates: Array<{ date: string; count: number }> }
  observations: number
  market: Map<string, { pp: number; n: number; sources: string[] }>
}

type Obs = { source: string; departure_date: string; return_date: string | null; nights: number | null; price_per_pax: number | string | null; airline: string | null; airline_code: string | null; direct: boolean | null; flight_numbers: string[] | null; options: ProbeOption[] | null; raw: Record<string, unknown> | null }

const monthRange = (months: string[]) => {
  const s = [...months].sort()
  const [y2, m2] = s[s.length - 1].split('-').map(Number)
  return { from: `${s[0]}-01`, to: new Date(Date.UTC(y2, m2, 0)).toISOString().slice(0, 10) }
}
export const marketKey = (dep: string, nights: number) => `${dep}|${nights}`

/** Arma el historial por aerolínea, el mercado por fecha y la demanda a partir de observaciones ya leídas. Puro. */
export function buildIntel(rows: Obs[], sabre: Array<{ depart_date: string; return_date: string; price_pp: number | string; itineraries: Array<Record<string, unknown>> | null }>, opts: { nights: number[]; airport: string | null; keys: string[] }): RouteIntel {
  const near = (n: number | null) => n === null || opts.nights.some(x => Math.abs(x - n) <= 3)
  type Acc = { name: string; prices: number[]; directs: number; total: number; sources: Record<string, number>; flights: Map<string, number> }
  const acc = new Map<string, Acc>()
  const add = (code: string, name: string | null, pp: number, direct: boolean | null, source: string, flights: string[] = []) => {
    if (!(pp > 0)) return
    const a: Acc = acc.get(code) ?? { name: name || code, prices: [], directs: 0, total: 0, sources: {}, flights: new Map<string, number>() }
    if (name && a.name === code) a.name = name
    a.prices.push(pp); a.total++; if (direct) a.directs++
    a.sources[source] = (a.sources[source] ?? 0) + 1
    for (const f of flights) a.flights.set(f, (a.flights.get(f) ?? 0) + 1)
    acc.set(code, a)
  }
  const marketAcc = new Map<string, { prices: number[]; sources: string[] }>()
  const addMarket = (dep: string, nights: number | null, pp: number, source: string) => {
    if (!dep || nights === null || !(pp > 0)) return
    const k = marketKey(dep, nights)
    const m = marketAcc.get(k) ?? { prices: [], sources: [] }
    m.prices.push(pp); if (!m.sources.includes(source)) m.sources.push(source)
    marketAcc.set(k, m)
  }
  const demandMonth: Record<string, { botQuotes: number; webSearches: number }> = {}
  const botLogs = new Set<string>(); let web = 0
  const dateCount = new Map<string, number>()

  for (const r of rows) {
    const pp = Number(r.price_per_pax)
    const nights = r.nights ?? (r.return_date ? Math.round((Date.parse(r.return_date) - Date.parse(r.departure_date)) / 86400000) : null)
    const month = r.departure_date.slice(0, 7)
    if (r.source === 'cotizador_probe') {
      if (near(nights)) for (const o of r.options ?? []) add(airlineKey(o), o.airline ?? null, o.pricePp, o.stopsOut === 0 && (o.stopsBack ?? 0) === 0, 'sondas', [o.flightOut, o.flightBack].filter(Boolean) as string[])
      addMarket(r.departure_date, nights, pp, 'sondas')
    } else if (r.source === 'crm_quote') {
      const id = String(r.raw?.crm_log_id ?? '')
      if (id && !botLogs.has(id)) { botLogs.add(id); (demandMonth[month] ??= { botQuotes: 0, webSearches: 0 }).botQuotes++ }
      if (r.raw?.chosen) { dateCount.set(r.departure_date, (dateCount.get(r.departure_date) ?? 0) + 1); if (near(nights) && (r.airline || r.airline_code)) add(airlineKey({ airline: r.airline ?? '', flightOut: r.flight_numbers?.[0] ?? r.airline_code ?? '' }), r.airline, pp, r.direct, 'bot', r.flight_numbers ?? []) }
      addMarket(r.departure_date, nights, pp, 'bot')
    } else if (r.source === 'tc_search') {
      web++; (demandMonth[month] ??= { botQuotes: 0, webSearches: 0 }).webSearches++
      dateCount.set(r.departure_date, (dateCount.get(r.departure_date) ?? 0) + 1)
      if (near(nights) && (r.airline_code || r.airline)) add(airlineKey({ airline: r.airline ?? '', flightOut: r.flight_numbers?.[0] ?? r.airline_code ?? '' }), r.airline, pp, r.direct, 'web', r.flight_numbers ?? [])
      addMarket(r.departure_date, nights, pp, 'web')
    }
  }
  for (const s of sabre) {
    const nights = Math.round((Date.parse(s.return_date) - Date.parse(s.depart_date)) / 86400000)
    addMarket(s.depart_date, nights, Number(s.price_pp), 'sabre')
    if (!near(nights)) continue
    for (const it of s.itineraries ?? []) {
      const code = String(it.airlineCode ?? '').toUpperCase(); const pp = Number(it.totalUsd)
      if (code) add(code, null, pp, Number(it.stopsOut ?? 1) === 0 && Number(it.stopsBack ?? 0) === 0, 'sabre', [...((it.flightNumbersOut as string[]) ?? []), ...((it.flightNumbersBack as string[]) ?? [])])
    }
  }
  // Mercado de cada fecha: la mediana de lo observado (robusta a una observación suelta).
  const market = new Map([...marketAcc.entries()].map(([k, m]) => [k, { pp: median(m.prices) ?? 0, n: m.prices.length, sources: m.sources }]))
  const history: AirlineHistory[] = [...acc.entries()].map(([code, a]) => ({
    code, name: a.name, observations: a.total, medianPp: median(a.prices), minPp: a.prices.length ? Math.round(Math.min(...a.prices)) : null,
    directShare: a.total ? Math.round((a.directs / a.total) * 100) / 100 : null, sources: a.sources,
    flights: [...a.flights.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([f]) => f),
  })).sort((x, y) => y.observations - x.observations)
  return {
    airport: opts.airport, keys: opts.keys, history, market, observations: rows.length + sabre.length,
    demand: { botQuotes: botLogs.size, webSearches: web, byMonth: demandMonth, topDates: [...dateCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([date, count]) => ({ date, count })) },
  }
}

/** Precio de mercado de una tirada: el mismo par (salida y noches); si no hay, ±1 día de salida. */
export function marketFor(intel: Pick<RouteIntel, 'market'>, dep: string, nights: number): { pp: number; sources: string[] } | null {
  const exact = intel.market.get(marketKey(dep, nights))
  if (exact) return exact
  for (const delta of [-1, 1]) {
    const d = new Date(Date.parse(`${dep}T00:00:00Z`) + delta * 86400000).toISOString().slice(0, 10)
    const m = intel.market.get(marketKey(d, nights))
    if (m) return m
  }
  return null
}

/** Lee de la base todo lo observado para la ruta del pedido en sus meses (60 días de historia; Sabre 30). */
export async function loadRouteIntel(db: Db, req: { originCode: string; destinationCode: string; profileCode: string | null; months: string[]; nights: number[] }): Promise<RouteIntel> {
  let airport: string | null = null
  if (req.profileCode) { const { data } = await db.from('destination_profiles').select('iata_airport').eq('code', req.profileCode).maybeSingle(); airport = (data?.iata_airport as string | null) ?? null }
  if (!airport) { const { data } = await db.from('destination_profiles').select('iata_airport').eq('tc_destination_code', req.destinationCode).limit(1); airport = (data?.[0]?.iata_airport as string | null) ?? null }
  const tcCodes = new Set<string>([req.destinationCode])
  if (airport) { const { data } = await db.from('destination_profiles').select('tc_destination_code').eq('iata_airport', airport); for (const p of data ?? []) if (p.tc_destination_code) tcCodes.add(p.tc_destination_code as string) }
  const keys = [...new Set([...tcCodes, ...(airport ? [airport] : [])])]
  const { from, to } = monthRange(req.months)
  const since = new Date(Date.now() - 60 * 86400000).toISOString()
  const list = keys.map(k => `"${k}"`).join(',')
  const { data: rows } = await db.from('flight_price_probes')
    .select('source, departure_date, return_date, nights, price_per_pax, airline, airline_code, direct, flight_numbers, options, raw')
    .eq('status', 'ok').eq('origin', req.originCode).in('source', ['cotizador_probe', 'crm_quote', 'tc_search'])
    .or(`destination.in.(${list}),destination_code.in.(${list})`)
    .gte('departure_date', from).lte('departure_date', to).gte('probed_at', since)
    .order('probed_at', { ascending: false }).limit(3000)
  const { data: routes } = await db.from('flight_landing_routes').select('id').eq('origin_tc_code', req.originCode).in('destination_code', [...tcCodes])
  const routeIds = (routes ?? []).map(r => r.id as number)
  const { data: sabre } = routeIds.length
    ? await db.from('flight_fare_estimates').select('depart_date, return_date, price_pp, itineraries').in('route_id', routeIds).gte('depart_date', from).lte('depart_date', to).gte('observed_at', new Date(Date.now() - 30 * 86400000).toISOString()).limit(2000)
    : { data: [] }
  return buildIntel((rows ?? []) as unknown as Obs[], (sabre ?? []) as never, { nights: req.nights, airport, keys })
}

/** Versión para guardar en el pedido (sin el Map). */
export function intelSummary(intel: RouteIntel) {
  return { airport: intel.airport, keys: intel.keys, observations: intel.observations, demand: intel.demand, history: intel.history.slice(0, 10), marketPoints: intel.market.size }
}
