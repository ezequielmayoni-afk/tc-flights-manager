import { SerpApiBudgetExhausted, type SerpApiClient } from '@/lib/serpapi/client'
import type { CollectorResult, DestinationSignal } from '../types'

/**
 * Google Trends vía SerpAPI: VALIDACIÓN, no descubrimiento.
 *
 * Autocomplete descubre; acá se toman los destinos más mencionados y se
 * comparan en grupos de 5 (una llamada por grupo). Google devuelve valores
 * relativos al grupo, así que un destino ancla viaja en todos los grupos y
 * los resultados se reescalan contra él (crossNormalize). Después, consultas
 * relacionadas para los más buscados (intención de compra).
 *
 * Presupuesto por corrida: MAX_SERPAPI_CALLS_PER_RUN (default 8): 4 grupos
 * (5 + 4 + 4 + 4 = 17 destinos) y 4 de consultas relacionadas.
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

export interface NormalizedScore {
  score: number
  rawBatchScore: number
  batch: number
  factor: number
  comparable: boolean
}

/**
 * Google Trends devuelve valores relativos al grupo comparado: en cada llamada
 * el más buscado vale 100. Para que los grupos sean comparables entre sí, el
 * ancla (el más fuerte del primer grupo) viaja en todos los demás y cada
 * grupo se reescala para que el ancla valga lo mismo que en el primero. Puro.
 */
export function crossNormalize(batches: ComparisonScore[][], anchorSlug: string): Map<string, NormalizedScore> {
  const out = new Map<string, NormalizedScore>()
  const anchorRef = batches[0]?.find(s => s.slug === anchorSlug)?.score ?? 0

  batches.forEach((scores, index) => {
    const anchorHere = scores.find(s => s.slug === anchorSlug)?.score ?? 0
    const comparable = index === 0 || (anchorRef > 0 && anchorHere > 0)
    const factor = comparable && index > 0 ? anchorRef / anchorHere : 1
    for (const s of scores) {
      if (index > 0 && s.slug === anchorSlug) continue
      out.set(s.slug, {
        score: Math.min(100, Math.round(s.score * factor)),
        rawBatchScore: s.score,
        batch: index + 1,
        factor: Math.round(factor * 100) / 100,
        comparable,
      })
    }
  })
  return out
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

  // Mitad del presupuesto para comparar, mitad para consultas relacionadas.
  const comparisonBudget = Math.max(1, Math.floor(maxCalls / 2))
  const relatedBudget = maxCalls - comparisonBudget
  const queue = [...topDestinations]
  const batches: ComparisonScore[][] = []
  const names = new Map(topDestinations.map(d => [d.slug, d.name]))
  let anchor: Named | null = null
  const related = new Map<string, Array<{ query: string; value: string }>>()

  try {
    // Grupo 1: los 5 más mencionados. El más buscado de ellos es el ancla.
    const first = queue.splice(0, 5)
    const firstScores = await compareDestinations(serpapi, first)
    queriesUsed++
    batches.push(firstScores)
    const best = [...firstScores].sort((a, b) => b.score - a.score)[0]
    anchor = best && best.score > 0 ? { slug: best.slug, name: best.name } : first[0]
    await new Promise(r => setTimeout(r, DELAY_MS))

    // Grupos siguientes: ancla + 4 destinos nuevos.
    for (let b = 1; b < comparisonBudget; b++) {
      const next = queue.splice(0, 4)
      if (next.length === 0) break
      batches.push(await compareDestinations(serpapi, [anchor, ...next]))
      queriesUsed++
      await new Promise(r => setTimeout(r, DELAY_MS))
    }
  } catch (err) {
    error = (err as Error).message
  }

  const normalized = anchor ? crossNormalize(batches, anchor.slug) : new Map<string, NormalizedScore>()

  // Consultas relacionadas para los más buscados según el score ya comparable.
  if (!error) {
    const topForRelated = [...normalized.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, relatedBudget)
    try {
      for (const [slug] of topForRelated) {
        related.set(slug, await fetchRelatedQueries(serpapi, names.get(slug) ?? slug))
        queriesUsed++
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    } catch (err) {
      // Presupuesto agotado a mitad de camino: se guarda lo que hay.
      error = (err as Error).message
    }
  }

  for (const [slug, n] of normalized) {
    destinations.set(slug, {
      rawScore: n.score,
      normalizedScore: Math.min(100, n.score),
      metadata: {
        name: names.get(slug) ?? slug,
        paqueteScore: n.score,
        rawBatchScore: n.rawBatchScore,
        batch: n.batch,
        anchor: anchor?.name ?? null,
        anchorFactor: n.factor,
        comparable: n.comparable,
        relatedQueries: related.get(slug) ?? [],
        comparisonBatch: true,
      },
    })
  }

  return { source: 'google_trends', destinations, queriesUsed, durationMs: Date.now() - started, error }
}
