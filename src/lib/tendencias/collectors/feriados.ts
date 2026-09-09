/**
 * Feriados y fines de semana largos de Argentina (argentinadatos.com, sin
 * clave). Un fin de semana largo a 30–90 días es demanda de escapadas y
 * cabotaje; el calendario completo sirve para elegir fechas de salida.
 */

const FERIADOS_URL = 'https://api.argentinadatos.com/v1/feriados'
const TIMEOUT_MS = 15_000

export interface Feriado {
  fecha: string
  tipo: string
  nombre: string
}

export interface LongWeekend {
  start: string
  end: string
  days: number
  names: string[]
  daysUntil: number
}

export async function fetchFeriados(year: number): Promise<Feriado[]> {
  const response = await fetch(`${FERIADOS_URL}/${year}`, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`argentinadatos ${response.status} en feriados ${year}`)
  const data = (await response.json()) as Feriado[]
  return data.filter(f => /^\d{4}-\d{2}-\d{2}$/.test(f.fecha))
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function weekday(iso: string): number {
  return new Date(`${iso}T00:00:00Z`).getUTCDay()
}

/**
 * Arma los fines de semana largos: días libres consecutivos (feriado o
 * sábado/domingo) de 3 o más días que incluyen al menos un feriado. Puro.
 */
export function longWeekends(feriados: Feriado[], from: Date, horizonDays = 120): LongWeekend[] {
  const fromIso = from.toISOString().slice(0, 10)
  const toIso = addDays(fromIso, horizonDays)
  const byDate = new Map<string, Feriado[]>()
  for (const f of feriados) {
    if (!byDate.has(f.fecha)) byDate.set(f.fecha, [])
    byDate.get(f.fecha)!.push(f)
  }
  const isFree = (iso: string) => byDate.has(iso) || weekday(iso) === 0 || weekday(iso) === 6

  const result: LongWeekend[] = []
  let cursor = addDays(fromIso, -3)
  while (cursor <= toIso) {
    if (!isFree(cursor)) { cursor = addDays(cursor, 1); continue }
    const start = cursor
    let end = cursor
    while (isFree(addDays(end, 1))) end = addDays(end, 1)
    const days = Math.round((new Date(`${end}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1
    const names: string[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) for (const f of byDate.get(d) ?? []) names.push(f.nombre)
    if (days >= 3 && names.length > 0 && end >= fromIso) {
      const daysUntil = Math.round((new Date(`${start}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000)
      result.push({ start, end, days, names: [...new Set(names)], daysUntil: Math.max(0, daysUntil) })
    }
    cursor = addDays(end, 1)
  }
  return result
}

export async function collectFeriados(asOf: Date = new Date()): Promise<{ feriados: Feriado[]; longWeekends: LongWeekend[]; errors: string[] }> {
  const year = asOf.getUTCFullYear()
  const errors: string[] = []
  const lists = await Promise.all([year, year + 1].map(y =>
    fetchFeriados(y).catch(err => { errors.push(`${y}: ${(err as Error).message}`); return [] as Feriado[] })
  ))
  const feriados = lists.flat().sort((a, b) => a.fecha.localeCompare(b.fecha))
  return { feriados, longWeekends: longWeekends(feriados, asOf), errors }
}
