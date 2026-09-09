import { SerpApiBudgetExhausted, type SerpApiClient } from '@/lib/serpapi/client'
import { TRENDS_COMPARISON_GROUPS, TRENDS_RELATED_TEMPLATE, TRENDS_RELATED_TOP, TRENDS_TEMPLATES } from '../config'
import type { CollectorResult, DestinationSignal } from '../types'

/**
 * Google Trends vía SerpAPI: la comparación directa entre destinos.
 *
 * Para cada plantilla ("paquetes {d}", "viaje {d}", "vuelos {d}") se comparan
 * los destinos candidatos en grupos de 5, una llamada por grupo. Google
 * devuelve valores relativos al grupo (el más buscado vale 100), así que el
 * más fuerte del primer grupo viaja como ancla en los demás y cada grupo se
 * reescala contra él (crossNormalize). El score del destino es el promedio
 * de las tres plantillas. Después, consultas relacionadas para los más
 * buscados (intención de compra).
 */

const GEO = 'AR'
const DATE_RANGE = 'today 1-m'
const DELAY_MS = 300
/** Promedio de los últimos N días: el último suele venir en 0 por retraso de Google. */
const RECENT_POINTS = 7

interface Named { slug: string; name: string }
interface ComparisonScore { slug: string; name: string; score: number }

function fill(template: string, name: string): string {
  return template.replace('{d}', name)
}

async function compareDestinations(serpapi: SerpApiClient, template: string, batch: Named[]): Promise<ComparisonScore[]> {
  if (batch.length === 0) return []
  try {
    const data = await serpapi.search({
      engine: 'google_trends',
      q: batch.map(d => fill(template, d.name)).join(','),
      geo: GEO,
      date: DATE_RANGE,
      data_type: 'TIMESERIES',
      hl: 'es',
    })
    const timeline = (data.interest_over_time as { timeline_data?: Array<{ values: Array<{ extracted_value?: number; value?: string }> }> })?.timeline_data ?? []
    if (timeline.length === 0) return batch.map(d => ({ ...d, score: 0 }))
    return batch.map((d, i) => {
      const points = timeline.map(p => p.values?.[i]?.extracted_value ?? parseInt(p.values?.[i]?.value ?? '0', 10) ?? 0)
      const recent = points.slice(-RECENT_POINTS).filter(v => v > 0)
      const avg = recent.length ? Math.round(recent.reduce((s, v) => s + v, 0) / recent.length) : 0
      return { ...d, score: avg }
    })
  } catch (err) {
    if (err instanceof SerpApiBudgetExhausted) throw err
    console.warn(`[tendencias/trends] comparación "${template}" falló: ${(err as Error).message}`)
    return batch.map(d => ({ ...d, score: 0 }))
  }
}

async function fetchRelatedQueries(serpapi: SerpApiClient, name: string): Promise<Array<{ query: string; value: string }>> {
  try {
    const data = await serpapi.search({ engine: 'google_trends', q: fill(TRENDS_RELATED_TEMPLATE, name), geo: GEO, date: DATE_RANGE, data_type: 'RELATED_QUERIES', hl: 'es' })
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
 * Reescala cada grupo para que el ancla valga lo mismo que en el primero. Puro.
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

/** Compara los candidatos con una plantilla en grupos anclados. */
async function compareWithTemplate(serpapi: SerpApiClient, template: string, candidates: Named[], groups: number): Promise<{ scores: Map<string, NormalizedScore>; anchor: Named | null; calls: number }> {
  const queue = [...candidates]
  const batches: ComparisonScore[][] = []
  let calls = 0

  const first = queue.splice(0, 5)
  const firstScores = await compareDestinations(serpapi, template, first)
  calls++
  batches.push(firstScores)
  const best = [...firstScores].sort((a, b) => b.score - a.score)[0]
  const anchor: Named | null = best && best.score > 0 ? { slug: best.slug, name: best.name } : first[0] ?? null
  await new Promise(r => setTimeout(r, DELAY_MS))

  for (let b = 1; b < groups && anchor; b++) {
    const next = queue.splice(0, 4)
    if (next.length === 0) break
    batches.push(await compareDestinations(serpapi, template, [anchor, ...next]))
    calls++
    await new Promise(r => setTimeout(r, DELAY_MS))
  }
  return { scores: anchor ? crossNormalize(batches, anchor.slug) : new Map(), anchor, calls }
}

export async function collectGoogleTrends(serpapi: SerpApiClient, candidates: Named[]): Promise<CollectorResult> {
  const started = Date.now()
  const destinations = new Map<string, DestinationSignal>()
  let queriesUsed = 0
  let error: string | undefined

  if (candidates.length === 0) {
    return { source: 'google_trends', destinations, queriesUsed, durationMs: 0, error: 'Sin destinos para validar' }
  }

  const names = new Map(candidates.map(d => [d.slug, d.name]))
  const perTemplate = new Map<string, { scores: Map<string, NormalizedScore>; anchor: Named | null }>()

  try {
    for (const template of TRENDS_TEMPLATES) {
      const { scores, anchor, calls } = await compareWithTemplate(serpapi, template, candidates, TRENDS_COMPARISON_GROUPS)
      queriesUsed += calls
      perTemplate.set(template, { scores, anchor })
    }
  } catch (err) {
    error = (err as Error).message
  }

  // Promedio sobre las plantillas que se completaron (si el presupuesto cortó a mitad, se usa lo que hay).
  const composite = new Map<string, number>()
  for (const d of candidates) {
    const values = [...perTemplate.values()].map(t => t.scores.get(d.slug)?.score ?? 0)
    if (values.length === 0) continue
    composite.set(d.slug, Math.round(values.reduce((s, v) => s + v, 0) / values.length))
  }

  const related = new Map<string, Array<{ query: string; value: string }>>()
  if (!error) {
    const topForRelated = [...composite.entries()].sort((a, b) => b[1] - a[1]).slice(0, TRENDS_RELATED_TOP)
    try {
      for (const [slug] of topForRelated) {
        related.set(slug, await fetchRelatedQueries(serpapi, names.get(slug) ?? slug))
        queriesUsed++
        await new Promise(r => setTimeout(r, DELAY_MS))
      }
    } catch (err) {
      error = (err as Error).message
    }
  }

  for (const [slug, score] of composite) {
    const templates: Record<string, unknown> = {}
    for (const [template, t] of perTemplate) {
      const n = t.scores.get(slug)
      templates[template.replace(' {d}', '')] = n ? { score: n.score, rawBatchScore: n.rawBatchScore, batch: n.batch, factor: n.factor, comparable: n.comparable, anchor: t.anchor?.name ?? null } : null
    }
    destinations.set(slug, {
      rawScore: score,
      normalizedScore: Math.min(100, score),
      metadata: { name: names.get(slug) ?? slug, paqueteScore: score, templates, relatedQueries: related.get(slug) ?? [], comparisonBatch: true },
    })
  }

  return { source: 'google_trends', destinations, queriesUsed, durationMs: Date.now() - started, error }
}
