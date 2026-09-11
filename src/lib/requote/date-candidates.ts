import type { FareCell, StopoverContext } from '@/lib/producto/types'
import type { DestinationProfile } from '@/lib/producto/types'
import { decideStopover } from '@/lib/producto/stopover-rule'
import type { SeasonWindow } from './season-window'

/**
 * Qué fechas sondear dentro de la ventana de temporada y cómo elegir entre
 * ellas con lo que devuelven las sondas de vuelo (el mismo mecanismo de
 * vuelos.siviajo.com: precio del aéreo por fecha, después la cotización
 * completa sólo para las mejores).
 */

const iso = (d: Date) => d.toISOString().slice(0, 10)
const parse = (s: string) => new Date(`${s}T00:00:00Z`)
export const addDays = (s: string, n: number) => iso(new Date(parse(s).getTime() + n * 86400000))

/**
 * Salidas candidatas: el mismo día de la semana que la salida original, cada
 * semana dentro de la ventana (los cupos y las tarifas se arman por día de
 * operación), más la salida original si sigue dentro de la ventana. Si
 * quedan pocas, se suman las semanas intermedias corridas 3 días.
 */
export function candidateDates(window: SeasonWindow, originalDeparture: string, options: { maxDates?: number } = {}): string[] {
  const max = options.maxDates ?? 10
  const dow = parse(originalDeparture).getUTCDay()
  const dates = new Set<string>()
  let cursor = window.from
  while (parse(cursor).getUTCDay() !== dow) cursor = addDays(cursor, 1)
  for (let d = cursor; d <= window.to; d = addDays(d, 7)) dates.add(d)
  if (originalDeparture >= window.from && originalDeparture <= window.to) dates.add(originalDeparture)
  if (dates.size < 4) {
    for (let d = addDays(cursor, 3); d <= window.to && dates.size < max; d = addDays(d, 7)) if (d >= window.from) dates.add(d)
  }
  const sorted = [...dates].sort()
  if (sorted.length <= max) return sorted
  // Demasiadas: se quedan las más cercanas a la salida original.
  const orig = parse(originalDeparture).getTime()
  return sorted.map(d => ({ d, dist: Math.abs(parse(d).getTime() - orig) })).sort((a, b) => a.dist - b.dist).slice(0, max).map(x => x.d).sort()
}

export interface RankedDate {
  date: string
  /** La tarifa elegida para esa fecha después de la regla directo/escala. */
  cell: FareCell
  bestDirect: FareCell | null
  bestStopover: FareCell | null
  reason: string
}

const cheapest = (cells: FareCell[]) => cells.length ? [...cells].sort((a, b) => a.pricePerPax - b.pricePerPax)[0] : null

/**
 * Por fecha: la mejor directa y la mejor con escala, la regla del perfil
 * decide cuál representa a la fecha; después se ordena por precio.
 */
export function rankDates(
  cellsByDate: Map<string, FareCell[]>,
  profile: Pick<DestinationProfile, 'stopover_threshold_pct' | 'stopover_modifiers' | 'direct_required'>,
  ctx: StopoverContext
): RankedDate[] {
  const ranked: RankedDate[] = []
  for (const [date, cells] of cellsByDate) {
    const usable = cells.filter(c => Number.isFinite(c.pricePerPax) && c.pricePerPax > 0)
    if (usable.length === 0) continue
    const bestDirect = cheapest(usable.filter(c => c.direct))
    const bestStopover = cheapest(usable.filter(c => !c.direct))
    if (profile.direct_required && !bestDirect) continue
    const decision = decideStopover(profile, ctx, bestDirect, bestStopover)
    const cell = decision.choice === 'direct' ? bestDirect : decision.choice === 'stopover' ? bestStopover : (bestDirect ?? bestStopover)
    if (!cell) continue
    ranked.push({ date, cell, bestDirect, bestStopover, reason: decision.reason })
  }
  return ranked.sort((a, b) => a.cell.pricePerPax - b.cell.pricePerPax || a.date.localeCompare(b.date))
}
