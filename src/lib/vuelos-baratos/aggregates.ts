import { isoDow, monthLabel, monthOf } from './date-pairs'
import type {
  BestPair,
  DestinationSummary,
  ExplorerFilters,
  LandingDestinationRow,
  LandingRouteRow,
  MonthSummary,
  ProbeRow,
  SortKey,
} from './types'

/**
 * Agregados de la landing: de las observaciones crudas
 * (`flight_price_probes`) a lo que muestran las páginas.
 *
 * Todo puro y sin efectos: las páginas leen de la base, agregan acá y cachean
 * el resultado. Una observación por par ida/vuelta (la más barata vigente) es
 * la unidad de todo lo demás.
 */

const DIA_MS = 24 * 60 * 60 * 1000

function nochesEntre(depart: string, regreso: string): number {
  const [ay, am, ad] = depart.split('-').map(Number)
  const [by, bm, bd] = regreso.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / DIA_MS)
}

function clave(pair: { depart: string; return: string }): string {
  return `${pair.depart}|${pair.return}`
}

/** Una sonda sirve para la landing solo si trajo precio de ida y vuelta. */
export function probeToPair(row: ProbeRow): BestPair | null {
  if (row.status !== 'ok') return null
  if (row.price_per_pax === null || row.price_per_pax <= 0) return null
  if (!row.return_date) return null

  return {
    probeId: row.id,
    routeId: row.route_id,
    depart: row.departure_date,
    return: row.return_date,
    nights: row.nights ?? nochesEntre(row.departure_date, row.return_date),
    pricePp: row.price_per_pax,
    currency: row.currency,
    airline: row.airline,
    airlineCode: row.airline_code,
    stopsOut: row.stops,
    stopsBack: row.stops_back,
    durationOutMin: row.duration_minutes,
    durationBackMin: row.duration_back_minutes,
    fareFamily: row.fare_family,
    checkedBag: row.checked_bag,
    carryOn: row.carry_on,
    observedAt: row.probed_at,
  }
}

/** El precio más bajo por par de fechas; a igual precio, la observación más nueva. */
export function bestPerPair(rows: ProbeRow[], opts: { fromDate: string }): BestPair[] {
  const mejores = new Map<string, BestPair>()
  for (const row of rows) {
    const pair = probeToPair(row)
    if (!pair) continue
    if (pair.depart < opts.fromDate) continue
    const k = clave(pair)
    const actual = mejores.get(k)
    if (!actual || pair.pricePp < actual.pricePp || (pair.pricePp === actual.pricePp && pair.observedAt > actual.observedAt)) {
      mejores.set(k, pair)
    }
  }
  return [...mejores.values()].sort((a, b) => a.depart.localeCompare(b.depart) || a.return.localeCompare(b.return))
}

/** Una entrada por mes pedido (con null donde no hay datos), para la tira de meses. */
export function bestPerMonth(pairs: BestPair[], months: string[]): MonthSummary[] {
  return months.map((month) => {
    const delMes = pairs.filter((p) => monthOf(p.depart) === month)
    const minPrice = delMes.length > 0 ? Math.min(...delMes.map((p) => p.pricePp)) : null
    return { month, label: monthLabel(month), minPrice, pairs: delMes.length }
  })
}

export function bestOverall(pairs: BestPair[]): BestPair | null {
  return pairs.reduce<BestPair | null>((mejor, p) => {
    if (!mejor) return p
    if (p.pricePp < mejor.pricePp) return p
    if (p.pricePp === mejor.pricePp && p.depart < mejor.depart) return p
    return mejor
  }, null)
}

export function lastObservedAt(pairs: BestPair[]): string | null {
  return pairs.reduce<string | null>((ultimo, p) => (ultimo === null || p.observedAt > ultimo ? p.observedAt : ultimo), null)
}

export function priceLimits(pairs: BestPair[]): { min: number; max: number } | null {
  if (pairs.length === 0) return null
  const precios = pairs.map((p) => p.pricePp)
  return { min: Math.min(...precios), max: Math.max(...precios) }
}

/** Aerolíneas con su precio más bajo, para el filtro del explorador. */
export function airlinesWithMin(pairs: BestPair[]): Array<{ airline: string; code: string | null; minPrice: number; count: number }> {
  const porAerolinea = new Map<string, { airline: string; code: string | null; minPrice: number; count: number }>()
  for (const p of pairs) {
    if (!p.airline) continue
    const actual = porAerolinea.get(p.airline)
    if (!actual) {
      porAerolinea.set(p.airline, { airline: p.airline, code: p.airlineCode, minPrice: p.pricePp, count: 1 })
      continue
    }
    actual.count++
    if (p.pricePp < actual.minPrice) actual.minPrice = p.pricePp
    if (!actual.code && p.airlineCode) actual.code = p.airlineCode
  }
  return [...porAerolinea.values()].sort((a, b) => a.minPrice - b.minPrice || a.airline.localeCompare(b.airline, 'es'))
}

function pasaEscalas(pair: BestPair, stops: 0 | 1 | 2): boolean {
  // Sin dato de escalas la fila no pasa: preferimos mostrar de menos antes que
  // prometer un directo que no sabemos si existe.
  if (pair.stopsOut === null) return false
  return stops === 2 ? pair.stopsOut >= 2 : pair.stopsOut === stops
}

export function applyFilters(pairs: BestPair[], f: ExplorerFilters): BestPair[] {
  const aerolineas = f.airlines?.map((a) => a.trim().toLowerCase()).filter(Boolean) ?? []

  return pairs.filter((p) => {
    if (f.month && monthOf(p.depart) !== f.month) return false
    if (f.direct && !(p.stopsOut === 0 && (p.stopsBack === 0 || p.stopsBack === null))) return false
    if (f.stops !== undefined && !pasaEscalas(p, f.stops)) return false
    if (f.stayMin !== undefined && p.nights < f.stayMin) return false
    if (f.stayMax !== undefined && p.nights > f.stayMax) return false
    if (f.departFrom && p.depart < f.departFrom) return false
    if (f.departTo && p.depart > f.departTo) return false
    if (f.returnFrom && p.return < f.returnFrom) return false
    if (f.returnTo && p.return > f.returnTo) return false
    if (f.departDow?.length && !f.departDow.includes(isoDow(p.depart))) return false
    if (f.returnDow?.length && !f.returnDow.includes(isoDow(p.return))) return false
    if (f.priceMin !== undefined && p.pricePp < f.priceMin) return false
    if (f.priceMax !== undefined && p.pricePp > f.priceMax) return false
    if (aerolineas.length > 0) {
      const propias = [p.airlineCode, p.airline].filter((v): v is string => Boolean(v)).map((v) => v.toLowerCase())
      if (!propias.some((v) => aerolineas.includes(v))) return false
    }
    return true
  })
}

/** Los nulos van siempre al final, en cualquier dirección. */
function comparaNumeroNullable(a: number | null, b: number | null, factor: number): number {
  if (a === null && b === null) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a === b ? 0 : (a - b) * factor
}

export function sortPairs(pairs: BestPair[], sort: SortKey, dir: 'asc' | 'desc'): BestPair[] {
  const factor = dir === 'desc' ? -1 : 1

  const primario = (a: BestPair, b: BestPair): number => {
    switch (sort) {
      case 'price':
        return (a.pricePp - b.pricePp) * factor
      case 'depart':
        return a.depart.localeCompare(b.depart) * factor
      case 'return':
        return a.return.localeCompare(b.return) * factor
      case 'nights':
        return (a.nights - b.nights) * factor
      case 'duration':
        return comparaNumeroNullable(a.durationOutMin, b.durationOutMin, factor)
      case 'stops':
        return comparaNumeroNullable(a.stopsOut, b.stopsOut, factor)
      case 'airline':
        if (a.airline === null && b.airline === null) return 0
        if (a.airline === null) return 1
        if (b.airline === null) return -1
        return a.airline.localeCompare(b.airline, 'es') * factor
      default:
        return 0
    }
  }

  return [...pairs].sort((a, b) => primario(a, b) || a.pricePp - b.pricePp || a.depart.localeCompare(b.depart))
}

export function paginate<T>(items: T[], page: number, pageSize: number): { items: T[]; page: number; pages: number; total: number } {
  const total = items.length
  const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  const actual = Math.min(Math.max(1, Math.floor(page) || 1), pages)
  const desde = (actual - 1) * pageSize
  return { items: items.slice(desde, desde + pageSize), page: actual, pages, total }
}

/** 'hace 5 min' / 'hace 6 h' / 'hace 2 días'. En el futuro o inválido: 'recién'. */
export function freshnessLabel(observedAt: string, now: Date): string {
  const ts = Date.parse(observedAt)
  if (Number.isNaN(ts)) return 'recién'
  const minutos = Math.floor((now.getTime() - ts) / 60_000)
  if (minutos < 0) return 'recién'
  if (minutos < 60) return `hace ${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 48) return `hace ${horas} h`
  return `hace ${Math.floor(horas / 24)} días`
}

/** Una tarjeta por ruta activa de destino activo, incluidas las que aún no tienen datos. */
export function summarizeDestinations(input: {
  rowsByRoute: Map<number, ProbeRow[]>
  routes: LandingRouteRow[]
  destinations: LandingDestinationRow[]
  fromDate: string
}): DestinationSummary[] {
  const porCodigo = new Map(input.destinations.map((d) => [d.code, d]))

  const resumen: DestinationSummary[] = []
  for (const route of input.routes) {
    if (!route.active) continue
    const destino = porCodigo.get(route.destination_code)
    if (!destino || !destino.active) continue

    const pairs = bestPerPair(input.rowsByRoute.get(route.id) ?? [], { fromDate: input.fromDate })
    resumen.push({
      code: destino.code,
      slug: destino.slug,
      name: destino.name,
      originCode: route.origin_tc_code,
      routeId: route.id,
      minPrice: bestOverall(pairs)?.pricePp ?? null,
      observedAt: lastObservedAt(pairs),
      pairs: pairs.length,
    })
  }

  // Orden de la grilla: el sort_order del destino; a igual orden, código y origen.
  return resumen.sort(
    (a, b) =>
      (porCodigo.get(a.code)?.sort_order ?? 0) - (porCodigo.get(b.code)?.sort_order ?? 0) ||
      a.code.localeCompare(b.code) ||
      a.originCode.localeCompare(b.originCode)
  )
}
