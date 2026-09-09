import { decideStopover } from './stopover-rule'
import type { DatePick, DestinationProfile, FareCell, StopoverContext } from './types'

/**
 * Elige la fecha de salida a partir del calendario de precios.
 *
 * Mismo criterio que el cotizador-bot (core/fechas_flexibles.py): el precio se
 * ajusta por duración (USD por hora sobre el vuelo más corto del calendario),
 * así una tarifa barata de 30 horas no gana sola. Después se aplica la regla
 * directo/escala entre el mejor directo y la mejor escala.
 */
export const USD_PER_HOUR = 25
const MAX_ALTERNATIVES = 4

export interface DatePickerOptions {
  /** Ventana permitida (inclusive), ISO yyyy-mm-dd. */
  from: string
  to: string
  /** Fechas a evitar (ej. cupos agotados o feriados que el perfil excluye). */
  exclude?: string[]
  /** Días de la semana permitidos (0 = domingo). Sin valor = todos. */
  weekdays?: number[]
  /** Precio máximo aceptable por pax; por encima no es candidato. */
  maxPricePerPax?: number
}

export function adjustedPrice(cell: FareCell, shortestMinutes: number | null): number {
  if (cell.durationMinutes === null || shortestMinutes === null) return cell.pricePerPax
  const extraHours = Math.max(0, (cell.durationMinutes - shortestMinutes) / 60)
  return Math.round((cell.pricePerPax + extraHours * USD_PER_HOUR) * 100) / 100
}

function weekday(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay()
}

export function pickDate(
  cells: FareCell[],
  profile: Pick<DestinationProfile, 'stopover_threshold_pct' | 'stopover_modifiers' | 'direct_required'>,
  ctx: StopoverContext,
  options: DatePickerOptions
): DatePick | null {
  const exclude = new Set(options.exclude ?? [])
  const candidates = cells.filter(c =>
    c.pricePerPax > 0 &&
    c.date >= options.from && c.date <= options.to &&
    !exclude.has(c.date) &&
    (!options.weekdays || options.weekdays.includes(weekday(c.date))) &&
    (options.maxPricePerPax === undefined || c.pricePerPax <= options.maxPricePerPax)
  )
  if (candidates.length === 0) return null

  const durations = candidates.map(c => c.durationMinutes).filter((d): d is number => d !== null)
  const shortest = durations.length ? Math.min(...durations) : null
  const scored = candidates
    .map(cell => ({ cell, adjusted: adjustedPrice(cell, shortest) }))
    .sort((a, b) => a.adjusted - b.adjusted || a.cell.date.localeCompare(b.cell.date))

  const bestDirect = scored.find(s => s.cell.direct) ?? null
  const bestStopover = scored.find(s => !s.cell.direct) ?? null
  const stopover = decideStopover(profile, ctx, bestDirect?.cell ?? null, bestStopover?.cell ?? null)

  const winner = stopover.choice === 'direct' ? bestDirect ?? bestStopover : stopover.choice === 'stopover' ? bestStopover ?? bestDirect : scored[0]
  if (!winner) return null

  const alternatives = scored.filter(s => s.cell.date !== winner.cell.date).slice(0, MAX_ALTERNATIVES).map(s => s.cell)
  const reason = [
    `${winner.cell.date}: USD ${winner.cell.pricePerPax} por pax${winner.cell.direct ? ', directo' : ', con escala'}${winner.cell.airline ? ` (${winner.cell.airline})` : ''}`,
    winner.adjusted !== winner.cell.pricePerPax ? `ajustado por duración a USD ${winner.adjusted}` : null,
    stopover.reason,
  ].filter(Boolean).join(' · ')

  return { chosen: winner.cell, alternatives, stopover, reason, adjustedPrice: winner.adjusted }
}
