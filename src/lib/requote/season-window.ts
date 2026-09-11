/**
 * Ventana de fechas "de la misma temporada" para mover un paquete cuyo cupo
 * se agotó. La temporada sale del perfil de destino (`high_season_months`):
 * si la salida cae en temporada alta, se busca dentro del bloque de meses
 * altos contiguos del mismo año (enero 17 con [1,2,7,12] → enero–febrero);
 * si cae en baja, dentro del bloque de meses bajos contiguos.
 *
 * Bloques largos (temporada baja de marzo a junio) se recortan a ~2 meses
 * alrededor de la salida original, porque el cotizador sondea pocas fechas
 * dentro del rango y conviene que estén cerca.
 */

export interface SeasonWindow {
  kind: 'alta' | 'baja'
  /** Meses del bloque (1–12), en orden. */
  months: number[]
  from: string
  to: string
  label: string
}

const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
/** Bloques más largos que esto se recortan alrededor de la salida original. */
const MAX_SPAN_DAYS = 70
const HALF_SPAN_DAYS = 31

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)
const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 86400000))
const lastDayOfMonth = (year: number, month: number) => iso(new Date(Date.UTC(year, month, 0)))
const firstDayOfMonth = (year: number, month: number) => iso(new Date(Date.UTC(year, month - 1, 1)))
const daysBetween = (a: string, b: string) => Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000)

export function seasonWindowFor(
  departureDate: string,
  highSeasonMonths: number[],
  options: { today: string; minLeadDays?: number } 
): SeasonWindow | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(departureDate)) return null
  const dep = parse(departureDate)
  const year = dep.getUTCFullYear()
  const month = dep.getUTCMonth() + 1
  const high = new Set(highSeasonMonths.filter(m => m >= 1 && m <= 12))
  const kind: SeasonWindow['kind'] = high.has(month) ? 'alta' : 'baja'
  const same = (m: number) => (kind === 'alta') === high.has(m)

  let start = month
  while (start > 1 && same(start - 1)) start--
  let end = month
  while (end < 12 && same(end + 1)) end++
  const months = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  let from = firstDayOfMonth(year, start)
  let to = lastDayOfMonth(year, end)
  if (daysBetween(from, to) > MAX_SPAN_DAYS) {
    from = addDays(departureDate, -HALF_SPAN_DAYS) < from ? from : addDays(departureDate, -HALF_SPAN_DAYS)
    to = addDays(departureDate, HALF_SPAN_DAYS) > to ? to : addDays(departureDate, HALF_SPAN_DAYS)
  }
  const minFrom = addDays(options.today, options.minLeadDays ?? 14)
  if (minFrom > from) from = minFrom
  if (from > to) return null

  const label = kind === 'alta'
    ? `temporada alta (${months.map(m => MONTH_NAMES[m - 1]).join('–')} ${year})`
    : `temporada baja (${MONTH_NAMES[start - 1]}–${MONTH_NAMES[end - 1]} ${year})`
  return { kind, months, from, to, label }
}
