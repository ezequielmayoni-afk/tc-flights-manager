import { SerpApiBudgetExhausted, type SerpApiClient } from '@/lib/serpapi/client'
import { GENERIC_TREND_SEEDS } from '../config'
import { matchKnownDestination, type KnownDestinations } from './known'
import { countsAsTravelDemand } from '../travel-terms'
import type { CollectorResult, DestinationSignal, GenericRelatedList } from '../types'

/**
 * Consultas relacionadas de términos genéricos en Google Trends Argentina,
 * último mes: para "paquetes" devuelve el top ("paquetes brasil" 83,
 * "punta cana" 23, "mendoza paquetes" 19) y las que están en alza
 * ("paquetes a florianopolis 2026", "msc cruceros +3.800 %").
 *
 * Es la forma más directa de saber qué destinos se buscan con intención de
 * compra y con qué volumen relativo, sin lista previa. Una llamada por
 * término. El destino se reconoce contra los conocidos de la corrida; las
 * consultas que no matchean ningún destino igual se muestran en la pantalla.
 */

const GEO = 'AR'
const DATE_RANGE = 'today 1-m'
const DELAY_MS = 300
const BREAKOUT_BOOST = 40
const MAX_RISING_BOOST = 40

/** "+3.800 %" → 3800; "Aumento puntual" (breakout) → null. */
export function parseRisingValue(value: string): number | null {
  const m = /([\d.,]+)\s*%/.exec(value)
  if (!m) return null
  const n = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

export function isBreakout(value: string): boolean {
  return /puntual|breakout/i.test(value)
}

async function fetchRelated(serpapi: SerpApiClient, seed: string): Promise<{ rising: Array<{ query: string; value: string }>; top: Array<{ query: string; value: number }> }> {
  const data = await serpapi.search({ engine: 'google_trends', q: seed, geo: GEO, date: DATE_RANGE, data_type: 'RELATED_QUERIES', hl: 'es' })
  const rq = (data.related_queries ?? {}) as { rising?: Array<{ query: string; value: string | number }>; top?: Array<{ query: string; value: string | number }> }
  return {
    rising: (rq.rising ?? []).map(q => ({ query: q.query, value: String(q.value) })),
    top: (rq.top ?? []).map(q => ({ query: q.query, value: Number(q.value) || 0 })),
  }
}

/** Convierte las listas en un score por destino. Puro. */
export function scoreRelatedLists(lists: GenericRelatedList[]): Map<string, DestinationSignal> {
  const acc = new Map<string, { top: number; risingBoost: number; queries: Array<{ query: string; value: string; seed: string }> }>()
  const get = (slug: string) => {
    let a = acc.get(slug)
    if (!a) { a = { top: 0, risingBoost: 0, queries: [] }; acc.set(slug, a) }
    return a
  }
  for (const list of lists) {
    for (const t of list.top) {
      if (!t.slug) continue
      const a = get(t.slug)
      a.top = Math.max(a.top, t.value)
      if (a.queries.length < 6) a.queries.push({ query: t.query, value: String(t.value), seed: list.seed })
    }
    for (const r of list.rising) {
      if (!r.slug) continue
      const a = get(r.slug)
      const pct = parseRisingValue(r.value)
      const boost = isBreakout(r.value) ? BREAKOUT_BOOST : pct === null ? 0 : Math.min(MAX_RISING_BOOST, pct / 10)
      a.risingBoost = Math.max(a.risingBoost, boost)
      if (a.queries.length < 6) a.queries.push({ query: r.query, value: r.value, seed: list.seed })
    }
  }
  const destinations = new Map<string, DestinationSignal>()
  for (const [slug, a] of acc) {
    const score = Math.min(100, Math.round(a.top + a.risingBoost))
    destinations.set(slug, { rawScore: score, normalizedScore: score, metadata: { topValue: a.top, risingBoost: Math.round(a.risingBoost), queries: a.queries } })
  }
  return destinations
}

export interface GoogleRelatedResult extends CollectorResult {
  lists: GenericRelatedList[]
}

export async function collectGoogleRelated(serpapi: SerpApiClient, known: KnownDestinations): Promise<GoogleRelatedResult> {
  const started = Date.now()
  const lists: GenericRelatedList[] = []
  let queriesUsed = 0
  let error: string | undefined

  for (const seed of GENERIC_TREND_SEEDS) {
    try {
      const { rising, top } = await fetchRelated(serpapi, seed)
      queriesUsed++
      lists.push({
        seed,
        rising: rising.slice(0, 15).map(r => ({ ...r, slug: countsAsTravelDemand(seed, r.query) ? matchKnownDestination(r.query, known) : null })),
        top: top.slice(0, 25).map(t => ({ ...t, slug: countsAsTravelDemand(seed, t.query) ? matchKnownDestination(t.query, known) : null })),
      })
      await new Promise(r => setTimeout(r, DELAY_MS))
    } catch (err) {
      if (err instanceof SerpApiBudgetExhausted) { error = err.message; break }
      queriesUsed++
      lists.push({ seed, rising: [], top: [], error: (err as Error).message })
    }
  }

  const destinations = scoreRelatedLists(lists)
  for (const [slug, signal] of destinations) signal.metadata.name = known.names.get(slug) ?? slug
  return { source: 'google_related', destinations, lists, queriesUsed, durationMs: Date.now() - started, error }
}
