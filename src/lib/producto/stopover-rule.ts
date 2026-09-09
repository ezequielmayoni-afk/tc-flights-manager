import type { DestinationProfile, FareCell, StopoverContext, StopoverDecision } from './types'

/**
 * Regla directo / escala por segmento.
 *
 * Un argentino acepta escala si el ahorro lo justifica, y "lo justifica" depende
 * del destino y del viaje: en Brasil corto casi nadie acepta escala (umbral 30 %),
 * en el Caribe en familia hay más tolerancia (22 %), en Europa y Asia casi todo
 * es con escala (7 % o sin umbral). Los moduladores ajustan por duración,
 * menores, pernocte y origen del interior (que ya asume conexión).
 */
const SHORT_TRIP_NIGHTS = 5

export function effectiveThreshold(profile: Pick<DestinationProfile, 'stopover_threshold_pct' | 'stopover_modifiers'>, ctx: StopoverContext, stopover: Pick<FareCell, 'overnightStop' | 'stops'> | null): number | null {
  if (profile.stopover_threshold_pct === null) return null
  const m = profile.stopover_modifiers
  let threshold = profile.stopover_threshold_pct
  if (ctx.nights <= SHORT_TRIP_NIGHTS) threshold += m.short_trip
  if (ctx.hasKids) threshold += m.kids
  if (stopover?.overnightStop) threshold += m.overnight
  if (ctx.originInterior) threshold += m.origin_interior
  // Una sola escala corta ("medio directo") exige menos ahorro que dos.
  if (stopover && (stopover.stops ?? 1) === 1 && !stopover.overnightStop) threshold = threshold * m.half_direct
  return Math.max(0, Math.round(threshold * 10) / 10)
}

export function decideStopover(
  profile: Pick<DestinationProfile, 'stopover_threshold_pct' | 'stopover_modifiers' | 'direct_required'>,
  ctx: StopoverContext,
  bestDirect: FareCell | null,
  bestStopover: FareCell | null
): StopoverDecision {
  if (!bestDirect && !bestStopover) {
    return { choice: 'only_option', thresholdPct: null, savingsPct: null, reason: 'Sin opciones de vuelo' }
  }
  if (!bestStopover) {
    return { choice: 'direct', thresholdPct: null, savingsPct: null, reason: 'Sólo hay vuelos directos' }
  }
  if (!bestDirect) {
    return { choice: 'only_option', thresholdPct: null, savingsPct: null, reason: profile.direct_required ? 'No hay directo y el destino lo exige: revisar' : 'No hay vuelos directos: se toma la mejor opción con escala' }
  }
  if (profile.direct_required) {
    return { choice: 'direct', thresholdPct: null, savingsPct: null, reason: 'El destino se vende sólo con vuelo directo' }
  }

  const threshold = effectiveThreshold(profile, ctx, bestStopover)
  const savingsPct = Math.round(((bestDirect.pricePerPax - bestStopover.pricePerPax) / bestDirect.pricePerPax) * 1000) / 10

  if (threshold === null) {
    const choice = bestStopover.pricePerPax < bestDirect.pricePerPax ? 'stopover' : 'direct'
    return { choice, thresholdPct: null, savingsPct, reason: 'Destino sin umbral: manda el precio' }
  }
  if (savingsPct >= threshold) {
    return { choice: 'stopover', thresholdPct: threshold, savingsPct, reason: `La escala ahorra ${savingsPct} % y el umbral es ${threshold} %` }
  }
  return { choice: 'direct', thresholdPct: threshold, savingsPct, reason: `La escala ahorra ${savingsPct} %, menos que el umbral de ${threshold} %` }
}
