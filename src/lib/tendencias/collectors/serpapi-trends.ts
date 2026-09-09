import { SerpApiBudgetExhausted, type SerpApiClient } from '@/lib/serpapi/client'
import type { CollectorResult, DestinationSignal } from '../types'

/**
 * Google Trends vía SerpAPI: VALIDACIÓN, no descubrimiento.
 *
 * Autocomplete descubre; acá se toman los destinos más mencionados y se
 * comparan de a 5 en una sola llamada (scores comparables entre sí), más
 * consultas relacionadas para los primeros (intención de compra).
 *
 * Presupuesto por corrida: MAX_SERPAPI_CALLS_PER_RUN (default 8): la mitad
 * para comparaciones (5 destinos cada una), la mitad para relacionadas.
 */

const GEO = 'AR'
const DATE_RANGE = 'today 1-m'
const DELAY_MS = 300

interface ComparisonScore { slug: string; name: string; score: number }
interface Named { slug: string; name: string }

async function compareDestinations(serpapi: SerpApiClient, batch: Named[]): Promise<ComparisonScore[]> {
  if (batch.length === 0) return []
  try {
    const data = await serpapi.search({
      engine: 'google_trends',
      q: batch.map(d => `paquete ${d.name}`).join(','),
      geo: GEO,
      date: DATE_RANGE,
      data_type: 'TIMESERIES',
      hl: 'es',
    })
    const timeline = (data.interest_over_time as { timeline_data?: Array<{ values: Array<{ extracted_value?: number; value?: string }> }> })?.timeline_data ?? []
    if (timeline.length === 0) return batch.map(d => ({ ...d, score: 0 }))

    // Promedio de los últimos 4 puntos con dato: el último suele venir en 0 por retraso de Google.
    return batch.map((d, i) => {
      const points = timeline.map(p => p.values?.[i]?.extracted_value ?? parseInt(p.values?.[i]?.value ?? '0', 10) ?? 0)
      const recent = points.slice(-4).filter(v => v > 0)
      const avg = recent.length ? Math.round(recent.reduce((s, v) => s + v, 0) / recent.length) : 0
      return { ...d, score: avg }
    })
  } catch (err) {
    if (err instanceof SerpApiBudgetExhausted) throw err
    console.warn(`[tendencias/trends] comparación falló: ${(err as Error).message}`)
    return batch.map(d => ({ ...d, score: 0 }))
  }
}

async function fetchRelatedQueries(serpapi: SerpApiClient, name: string): Promise<Array<{ query: string; value: string }>> {
  try {
    const data = await serpapi.search({
      engine: 'google_trends',
      q: `paquete ${name}`,
      geo: GEO,
      date: DATE_RANGE,
      data_type: 'RELATED_QUERIES',
      hl: 'es',
    })
    const rising = (data.related_queries as { rising?: Array<{ query: string; value: string | number }> })?.rising ?? []
    return rising.slice(0, 8).map(q => ({ query: q.query, value: String(q.value) }))
  } catch (err) {
    if (err instanceof SerpApiBudgetExhausted) throw err
    return []
  }
}

export async function collectGoogleTrends(
  serpapi: SerpApiClient,
  topDestinations: Named[],
  maxCalls: number
): Promise<CollectorResult> {
  const started = Date.now()
  const destinations = new Map<string, DestinationSignal>()
  let queriesUsed = 0
  let error: string | undefined

  if (topDestinations.length === 0 || maxCalls <= 0) {
    return { source: 'google_trends', destinations, queriesUsed, durationMs: 0, error: 'Sin destinos para validar' }
  }

  const comparisonBudget = Math.max(1, Math.floor(maxCalls / 2))
  const relatedBudget = maxCalls - comparisonBudget
  const toScore = topDestinations.slice(0, comparisonBudget * 5)
  const scores: ComparisonScore[] = []
  const related = new Map<string, Array<{ query: string; value: string }>>()

  try {
    for (let i = 0; i < toScore.length; i += 5) {
      scores.push(...await compareDestinations(serpapi, toScore.slice(i, i + 5)))
      queriesUsed++
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
    for (const dest of toScore.slice(0, relatedBudget)) {
      related.set(dest.slug, await fetchRelatedQueries(serpapi, dest.name))
      queriesUsed++
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  } catch (err) {
    // Presupuesto agotado a mitad de camino: se guarda lo que hay.
    error = (err as Error).message
  }

  for (const s of scores) {
    destinations.set(s.slug, {
      rawScore: s.score,
      normalizedScore: Math.min(100, s.score),
      metadata: { name: s.name, paqueteScore: s.score, relatedQueries: related.get(s.slug) ?? [], comparisonBatch: true },
    })
  }

  return { source: 'google_trends', destinations, queriesUsed, durationMs: Date.now() - started, error }
}
