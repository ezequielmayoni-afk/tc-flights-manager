import { MIN_TREND_SCORE } from './config'
import type { TrendDestination } from './types'

/**
 * Matriz 2×2:
 *
 *                     Con paquetes    Sin paquetes
 *   Score alto        OPPORTUNITY     GAP
 *   Score bajo        SATURATED       DECLINING
 *
 * "Alto" = ≥ 50 o dentro del 25 % superior de la corrida; un destino en alza
 * (surging/rising) o nuevo con score razonable también cuenta como accionable.
 */
export function classifyDestinations(destinations: TrendDestination[]): TrendDestination[] {
  const scores = destinations.map(d => d.trendScore).filter(s => s > 0).sort((a, b) => b - a)
  const p75Score = scores[Math.floor(scores.length * 0.25)] ?? 20

  for (const dest of destinations) {
    if (dest.trendScore < MIN_TREND_SCORE) {
      dest.classification = dest.hasPackages ? 'saturated' : 'declining'
      continue
    }

    const isHighScore = dest.trendScore >= 50 || dest.trendScore >= p75Score
    const isRising = dest.momentum === 'surging' || dest.momentum === 'rising'
    const isFirstRunActionable = dest.momentum === 'new' && dest.trendScore >= MIN_TREND_SCORE
    const actionable = isHighScore || isRising || isFirstRunActionable

    if (dest.hasPackages) dest.classification = actionable ? 'opportunity' : 'saturated'
    else dest.classification = actionable ? 'gap' : 'declining'
  }

  return destinations
}
