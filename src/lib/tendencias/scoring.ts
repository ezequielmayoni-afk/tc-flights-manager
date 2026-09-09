import { SOURCE_WEIGHTS, MOMENTUM_THRESHOLDS, getAllDestinations } from './config'
import type { CollectorResult, TrendDestination, RelatedQuery, Momentum } from './types'

const BUY_KEYWORDS = ['paquete', 'precio', 'todo incluido', 'oferta', 'reservar', 'cotizar', 'vuelo', 'pasaje', 'costo', 'cuanto cuesta', 'cuánto cuesta', 'desde', 'salida', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', '2026', '2027']
const INFO_KEYWORDS = ['requisitos', 'clima', 'que hacer', 'qué hacer', 'que visitar', 'qué visitar', 'como llegar', 'cómo llegar', 'donde', 'dónde', 'mapa', 'tiempo', 'visa', 'moneda', 'idioma']
const BRAND_KEYWORDS = ['aerolíneas', 'aerolineas', 'despegar', 'almundo', 'flybondi', 'jetsmart', 'latam', 'american airlines', 'copa', 'avantrip']

export function classifyIntent(query: string): RelatedQuery['intent'] {
  const q = query.toLowerCase()
  if (INFO_KEYWORDS.some(k => q.includes(k))) return 'info'
  if (BRAND_KEYWORDS.some(k => q.includes(k))) return 'brand'
  if (BUY_KEYWORDS.some(k => q.includes(k))) return 'buy'
  return 'other'
}

function extractRelatedQueries(rawSignals: Record<string, unknown>): RelatedQuery[] {
  const gt = rawSignals.google_trends as { relatedQueries?: Array<{ query: string; value: string | number }> } | undefined
  if (!gt?.relatedQueries) return []
  return gt.relatedQueries.map(rq => ({
    query: rq.query,
    value: String(rq.value),
    intent: classifyIntent(rq.query),
  }))
}

export function momentumFor(trendScore: number, prevScore: number | null): { changePct: number | null; momentum: Momentum } {
  if (prevScore === null) return { changePct: null, momentum: 'new' }
  const changePct = prevScore > 0
    ? Math.round(((trendScore - prevScore) / prevScore) * 100)
    : trendScore > 0 ? 100 : 0
  let momentum: Momentum = 'stable'
  if (changePct > MOMENTUM_THRESHOLDS.surging) momentum = 'surging'
  else if (changePct > MOMENTUM_THRESHOLDS.rising) momentum = 'rising'
  else if (changePct < MOMENTUM_THRESHOLDS.falling) momentum = 'falling'
  return { changePct, momentum }
}

/**
 * Combina las señales de todos los colectores en un score por destino.
 *
 * Recorre TODOS los destinos descubiertos (no sólo la lista semilla): si
 * Autocomplete encuentra "Albania" trending, se puntúa igual con región
 * "descubierto". Los semilla entran siempre, aunque con 0, para continuidad.
 * Los pesos se reparten entre las fuentes que respondieron en la corrida.
 */
export function computeScores(
  collectorResults: CollectorResult[],
  prevWeekScores: Map<string, number>
): TrendDestination[] {
  const seeds = getAllDestinations()
  const regionMap = new Map(seeds.map(d => [d.slug, d.region]))

  const allSlugs = new Set<string>()
  const nameMap = new Map<string, string>()

  for (const result of collectorResults) {
    for (const [slug, signal] of result.destinations) {
      allSlugs.add(slug)
      const meta = signal.metadata as { name?: string }
      if (meta?.name && !nameMap.has(slug)) nameMap.set(slug, meta.name)
    }
  }
  for (const d of seeds) {
    allSlugs.add(d.slug)
    nameMap.set(d.slug, d.name) // el nombre semilla (con acento, en castellano) gana
  }

  const signalsBySource = new Map<string, Map<string, number>>()
  for (const result of collectorResults) {
    if (result.destinations.size === 0) continue
    signalsBySource.set(result.source, new Map([...result.destinations].map(([slug, s]) => [slug, s.normalizedScore])))
  }
  const activeWeights = Object.entries(SOURCE_WEIGHTS).filter(([source, w]) => w > 0 && signalsBySource.has(source))
  const totalWeight = activeWeights.reduce((s, [, w]) => s + w, 0) || 1

  const destinations: TrendDestination[] = [...allSlugs].map(slug => {
    const signals: Record<string, number> = {}
    for (const source of Object.keys(SOURCE_WEIGHTS)) signals[source] = signalsBySource.get(source)?.get(slug) ?? 0

    const trendScore = Math.round(activeWeights.reduce((sum, [source, w]) => sum + signals[source] * w, 0) / totalWeight)

    const prevScore = prevWeekScores.get(slug) ?? null
    const { changePct, momentum } = momentumFor(trendScore, prevScore)

    const rawSignals: Record<string, unknown> = {}
    for (const result of collectorResults) {
      const s = result.destinations.get(slug)
      if (s) rawSignals[result.source] = s.metadata
    }

    return {
      destination: nameMap.get(slug) || slug,
      destinationSlug: slug,
      region: regionMap.get(slug) || 'descubierto',
      trendScore,
      rank: 0,
      signals,
      prevWeekScore: prevScore,
      changePct,
      momentum,
      hasPackages: false,
      matchingPackageCount: 0,
      matchingPackageIds: [],
      cheapestPackagePrice: null,
      classification: 'declining',
      relatedQueries: extractRelatedQueries(rawSignals),
      rawSignals,
    }
  })

  // Normalización por corrida: el destino más fuerte vale 100.
  const maxScore = Math.max(...destinations.map(d => d.trendScore), 1)
  if (maxScore < 100) {
    const factor = 100 / maxScore
    for (const dest of destinations) dest.trendScore = Math.round(dest.trendScore * factor)
  }
  // El momentum se calcula después de normalizar, para comparar 0–100 con 0–100.
  for (const dest of destinations) {
    const m = momentumFor(dest.trendScore, dest.prevWeekScore)
    dest.changePct = m.changePct
    dest.momentum = m.momentum
  }

  destinations.sort((a, b) => b.trendScore - a.trendScore || a.destination.localeCompare(b.destination))
  const relevant = destinations.filter(d => d.trendScore > 0)
  relevant.forEach((d, i) => { d.rank = i + 1 })
  return relevant
}
