import type { ProbeOption } from '@/lib/cotizador/client'
import { optionIsDirect } from './requests'

/**
 * Un cupo se negocia con UNA aerolínea: todas las tiradas de un pedido tienen
 * que ser de la misma. Con las opciones sondeadas por fecha se compara cada
 * aerolínea en todas las fechas (cuántas cubre, precio promedio, directos) y se
 * elige la que más conviene; el historial de la ruta (sondas, Sabre, búsquedas
 * de la web y cotizaciones del bot) desempata y se muestra al lado. Puro.
 */

export interface DateOptions { date: string; nights: number; group: number | null; groupLabel: string | null; seats: number; directOnly: boolean; options: ProbeOption[] }

export interface AirlineHistory { code: string; name: string; observations: number; medianPp: number | null; minPp: number | null; directShare: number | null; sources: Record<string, number>; flights: string[] }

export interface AirlineStat {
  code: string; name: string; covered: number; total: number; avgPp: number | null; minPp: number | null; maxPp: number | null
  directShare: number; missingDates: string[]; history: AirlineHistory | null
}

export interface AirlineDecision { chosen: string | null; chosenName: string | null; reason: string; stats: AirlineStat[] }

/** Nombre de aerolínea (como lo escriben siviajo, Sabre o el bot) → código IATA. */
const AIRLINE_CODES: Array<[RegExp, string]> = [
  [/jet\s*smart/i, 'JA'], [/arajet/i, 'DM'], [/aerol[ií]neas\s+argentinas|^aerol[ií]neas$/i, 'AR'], [/latam/i, 'LA'], [/^gol\b|gol\s+transportes/i, 'G3'],
  [/avianca/i, 'AV'], [/copa/i, 'CM'], [/azul/i, 'AD'], [/flybondi/i, 'FO'], [/american/i, 'AA'], [/iberia/i, 'IB'], [/air\s*europa/i, 'UX'],
  [/emirates/i, 'EK'], [/turkish/i, 'TK'], [/plus\s*ultra/i, 'PU'], [/aerom[eé]xico/i, 'AM'], [/^sky\b/i, 'H2'], [/level/i, 'LV'], [/united/i, 'UA'],
  [/delta/i, 'DL'], [/air\s*france/i, 'AF'], [/klm/i, 'KL'], [/lufthansa/i, 'LH'], [/ita\s*airways|^ita$/i, 'AZ'], [/tap/i, 'TP'], [/qatar/i, 'QR'],
  [/ethiopian/i, 'ET'], [/british/i, 'BA'], [/wingo/i, 'P5'], [/boliviana/i, 'OB'], [/paranair/i, 'ZP'], [/andes/i, 'OY'], [/jetblue/i, 'B6'],
]

/** Clave de aerolínea: el código IATA por nombre; si no se reconoce, el prefijo con letras del vuelo (JA3840); si no, el nombre. */
export function airlineKey(o: Pick<ProbeOption, 'flightOut' | 'airline'>): string {
  const name = (o.airline || '').trim()
  for (const [re, code] of AIRLINE_CODES) if (re.test(name)) return code
  const m = /^([A-Z][A-Z0-9]|[0-9][A-Z])\s*\d/i.exec((o.flightOut || '').trim())
  if (m) return m[1].toUpperCase()
  return (name || '?').toUpperCase()
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/gi, '').toUpperCase()

/** ¿La aerolínea coincide con alguna preferencia ("JetSMART", "JA", "Aerolíneas")? */
export function matchesPref(code: string, name: string, prefs: string[]): boolean {
  if (prefs.length === 0) return true
  const n = norm(name)
  return prefs.some(p => { const q = norm(p); return q === code || (q.length >= 3 && (n.includes(q) || q.includes(n))) })
}

/** La mejor (más barata) opción de cada aerolínea en una fecha. */
export function bestByAirline(options: ProbeOption[], directOnly: boolean): Map<string, ProbeOption> {
  const out = new Map<string, ProbeOption>()
  for (const o of options) {
    if (!o || !(o.pricePp > 0)) continue
    if (directOnly && !optionIsDirect(o)) continue
    const k = airlineKey(o)
    const cur = out.get(k)
    if (!cur || o.pricePp < cur.pricePp || (o.pricePp === cur.pricePp && optionIsDirect(o) && !optionIsDirect(cur))) out.set(k, o)
  }
  return out
}

const round = (n: number) => Math.round(n)
/** Una escala resta: al comparar aerolíneas, su promedio cuenta 15 % más caro en proporción a las fechas con escala. */
export const STOP_PENALTY = 0.15
const effective = (s: Pick<AirlineStat, 'avgPp' | 'directShare'>) => (s.avgPp ?? Infinity) * (1 + STOP_PENALTY * (1 - s.directShare))

/**
 * Compara las aerolíneas en todas las fechas y elige una.
 * Regla: gana la que cubre más fechas; entre las que cubren el máximo, la de
 * menor precio promedio, donde las fechas con escala cuentan 15 % más caras
 * (a igual precio, más directos y más historial). Con 4
 * fechas o más, si una que cubre una sola fecha menos (y al menos 75 %), sin
 * menos directos, es 10 % o más barata, gana ella y se avisa qué fecha se pierde.
 */
export function analyzeAirlines(dates: DateOptions[], opts: { prefs?: string[]; history?: Map<string, AirlineHistory> } = {}): AirlineDecision {
  const prefs = (opts.prefs ?? []).filter(Boolean)
  const history = opts.history ?? new Map()
  const perDate = dates.map(d => bestByAirline(d.options, d.directOnly))
  const names = new Map<string, string>()
  dates.forEach((d, i) => perDate[i].forEach((o, k) => { if (!names.has(k) && o.airline) names.set(k, o.airline) }))
  const total = dates.length
  const stats: AirlineStat[] = [...names.keys()].map(code => {
    const prices: number[] = []; let directs = 0; const missing: string[] = []
    dates.forEach((d, i) => { const o = perDate[i].get(code); if (o) { prices.push(o.pricePp); if (optionIsDirect(o)) directs++ } else missing.push(`${d.date} (${d.nights} n)`) })
    return {
      code, name: names.get(code) ?? code, covered: prices.length, total,
      avgPp: prices.length ? round(prices.reduce((a, b) => a + b, 0) / prices.length) : null, minPp: prices.length ? round(Math.min(...prices)) : null, maxPp: prices.length ? round(Math.max(...prices)) : null,
      directShare: prices.length ? Math.round((directs / prices.length) * 100) / 100 : 0, missingDates: missing, history: history.get(code) ?? null,
    }
  })
  const cmp = (a: AirlineStat, b: AirlineStat) => b.covered - a.covered || effective(a) - effective(b) || b.directShare - a.directShare || (b.history?.observations ?? 0) - (a.history?.observations ?? 0)
  stats.sort(cmp)
  if (stats.length === 0) return { chosen: null, chosenName: null, reason: 'Ninguna fecha devolvió opciones que cumplan lo pedido', stats }

  let pool = stats
  let prefNote = ''
  if (prefs.length) {
    const preferred = stats.filter(s => matchesPref(s.code, s.name, prefs))
    if (preferred.length) pool = preferred
    else prefNote = ` Ninguna opción fue de ${prefs.join('/')}: se eligió entre las demás.`
  }
  const maxCov = pool[0].covered
  const top = pool.filter(s => s.covered === maxCov).sort(cmp)[0]
  let chosen = top
  let reason = `${top.name}: ${top.covered} de ${total} fechas, promedio USD ${top.avgPp} por persona${top.directShare === 1 ? ', todas directas' : top.directShare > 0 ? `, ${Math.round(top.directShare * 100)} % directas` : ', con escala'}.`
  // Excepción: con 4 fechas o más, una que pierde una sola fecha, no cambia directos por escalas y es 10 % más barata.
  const cheaper = total >= 4 ? pool.filter(s => s.covered === maxCov - 1 && s.covered >= Math.ceil(total * 0.75) && s.directShare >= top.directShare && s.avgPp !== null && top.avgPp !== null && effective(s) <= effective(top) * 0.9).sort(cmp)[0] : undefined
  if (cheaper) {
    chosen = cheaper
    reason = `${cheaper.name}: ${Math.round((1 - cheaper.avgPp! / top.avgPp!) * 100)} % más barata que ${top.name} (USD ${cheaper.avgPp} vs ${top.avgPp}) aunque no tiene opción el ${cheaper.missingDates.join(', ')}.`
  }
  const runner = pool.find(s => s.code !== chosen.code)
  if (runner && runner.avgPp !== null && chosen.avgPp !== null) {
    reason += ` Le sigue ${runner.name} (${runner.covered}/${total} fechas, USD ${runner.avgPp}${runner.directShare < 1 ? ', con escala' : ''}).`
    if (runner.covered === chosen.covered && runner.avgPp < chosen.avgPp) reason += ` ${runner.name} es más barata pero con escala: al comparar, una escala cuenta ${Math.round(STOP_PENALTY * 100)} % más cara.`
  }
  if (chosen.history?.observations) reason += ` Historial de la ruta: ${chosen.history.observations} precios observados${chosen.history.medianPp ? `, mediana USD ${chosen.history.medianPp}` : ''}.`
  reason += prefNote
  return { chosen: chosen.code, chosenName: chosen.name, reason, stats }
}

/** Tiradas de una aerolínea: su mejor opción en cada fecha (las fechas sin opción quedan afuera). */
export function optionsForAirline(dates: DateOptions[], code: string): Array<{ d: DateOptions; option: ProbeOption }> {
  return dates.flatMap(d => { const o = bestByAirline(d.options, d.directOnly).get(code); return o ? [{ d, option: o }] : [] })
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const s = [...values].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return round(s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2)
}
