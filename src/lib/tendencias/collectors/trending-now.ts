import type { SerpApiClient } from '@/lib/serpapi/client'
import { matchKnownDestination, type KnownDestinations } from './known'
import type { CollectorResult, DestinationSignal, TrendingItem } from '../types'

/**
 * "Tendencias ahora" de Google Trends para Argentina, últimos 7 días: de qué
 * se habla, con volumen de búsqueda estimado y categoría. Se guardan las de
 * la categoría Viajes y transporte y cualquier tema que nombre un destino
 * conocido (un evento o un desastre en un destino también es señal).
 * Una sola llamada a SerpAPI.
 */

const TRAVEL_CATEGORY_ID = 19
const MAX_ITEMS_KEPT = 60
/** Un partido de "Gimnasia de Mendoza" o el "Inter Miami" no son demanda de viaje. */
const NOISE_CATEGORIES = new Set(['Sports', 'Politics', 'Law and Government', 'Games', 'Autos and Vehicles', 'Entertainment'])

interface RawTrend {
  query: string
  search_volume?: number
  increase_percentage?: number
  categories?: Array<{ id: number; name: string }>
  trend_breakdown?: string[]
}

/** Convierte la respuesta cruda en items y en un score por destino. Puro. */
export function processTrending(raw: RawTrend[], known: KnownDestinations): { items: TrendingItem[]; destinations: Map<string, DestinationSignal> } {
  const items: TrendingItem[] = raw.map(t => {
    const categories = (t.categories ?? []).map(c => c.name)
    const travel = (t.categories ?? []).some(c => c.id === TRAVEL_CATEGORY_ID)
    const breakdown = (t.trend_breakdown ?? []).slice(0, 5)
    const noisy = categories.some(c => NOISE_CATEGORIES.has(c)) && !travel
    const slug = noisy ? null : matchKnownDestination(t.query, known)
    return { query: t.query, volume: t.search_volume ?? null, increasePct: t.increase_percentage ?? null, categories, travel, slug, breakdown }
  })

  const relevant = items.filter(i => i.travel || i.slug).sort((a, b) => (b.volume ?? 0) - (a.volume ?? 0))
  const byDest = new Map<string, { volume: number; queries: string[] }>()
  for (const item of relevant) {
    // Al score sólo entra la categoría Viajes; un temporal o un evento se muestra pero no suma.
    if (!item.slug || !item.travel) continue
    const d = byDest.get(item.slug) ?? { volume: 0, queries: [] }
    d.volume = Math.max(d.volume, item.volume ?? 0)
    if (d.queries.length < 4) d.queries.push(item.query)
    byDest.set(item.slug, d)
  }
  const maxVolume = Math.max(...[...byDest.values()].map(d => d.volume), 1)
  const destinations = new Map<string, DestinationSignal>()
  for (const [slug, d] of byDest) {
    // Escala logarítmica: 500.000 búsquedas de un partido no deben aplastar 5.000 de un destino.
    const normalized = d.volume > 0 ? Math.round((Math.log10(d.volume + 1) / Math.log10(maxVolume + 1)) * 100) : 0
    destinations.set(slug, { rawScore: d.volume, normalizedScore: normalized, metadata: { name: known.names.get(slug) ?? slug, volume: d.volume, queries: d.queries } })
  }
  return { items: relevant.slice(0, MAX_ITEMS_KEPT), destinations }
}

export interface TrendingNowResult extends CollectorResult {
  items: TrendingItem[]
}

export async function collectTrendingNow(serpapi: SerpApiClient, known: KnownDestinations): Promise<TrendingNowResult> {
  const started = Date.now()
  try {
    const data = await serpapi.search({ engine: 'google_trends_trending_now', geo: 'AR', hours: '168', hl: 'es' })
    const raw = (data.trending_searches ?? []) as RawTrend[]
    const { items, destinations } = processTrending(raw, known)
    return { source: 'trending_now', destinations, items, queriesUsed: 1, durationMs: Date.now() - started }
  } catch (err) {
    return { source: 'trending_now', destinations: new Map(), items: [], queriesUsed: 1, durationMs: Date.now() - started, error: (err as Error).message }
  }
}
