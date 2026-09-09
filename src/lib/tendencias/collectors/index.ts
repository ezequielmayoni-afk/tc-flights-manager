import { collectAutocomplete, collectYoutube } from './autocomplete'
import { collectGoogleRelated } from './google-related'
import { collectGoogleTrends } from './serpapi-trends'
import { collectTrendingNow } from './trending-now'
import { buildKnown } from './known'
import { MAX_TRENDS_CANDIDATES, TOP_DISCOVERED_FOR_VALIDATION } from '../config'
import type { CollectorResult, TendenciasContext, TrendBuzz } from '../types'

export interface CollectAllResult {
  results: CollectorResult[]
  sourcesCollected: Record<string, boolean>
  serpApiCalls: number
  buzz: TrendBuzz
}

/**
 * Recolección en cuatro pasos, sólo demanda de mercado (nada de siviajo.com):
 *   1. Google Autocomplete (gratis): descubre qué destinos escribe la gente.
 *   2. Consultas relacionadas de "paquetes", "viajes", "vuelos"… (SerpAPI):
 *      qué se busca con intención de compra y con qué volumen relativo.
 *   3. Google Trends (SerpAPI): compara los 17 candidatos más fuertes con
 *      tres plantillas y grupos anclados; YouTube corrobora en paralelo.
 *   4. "Tendencias ahora" de Argentina: de qué se habla esta semana.
 */
export async function collectAll(ctx: TendenciasContext): Promise<CollectAllResult> {
  const results: CollectorResult[] = []
  const sourcesCollected: Record<string, boolean> = {}
  let serpApiCalls = 0
  const summarize = (r: CollectorResult) => [...r.destinations.entries()].sort((a, b) => b[1].normalizedScore - a[1].normalizedScore).slice(0, 8).map(([slug, s]) => `${slug}:${s.normalizedScore}`)

  // 1. Descubrimiento
  const autocomplete = await collectAutocomplete(ctx.heartbeat)
  results.push(autocomplete)
  sourcesCollected.autocomplete = !autocomplete.error && autocomplete.destinations.size > 0
  await ctx.log(`Autocomplete Google: ${autocomplete.destinations.size} destinos con ${autocomplete.queriesUsed} consultas`, { error: autocomplete.error ?? null, top: summarize(autocomplete) }, autocomplete.error ? 'warning' : 'info')
  await ctx.heartbeat?.()

  const discoveredNames = new Map<string, string>()
  for (const [slug, s] of autocomplete.destinations) discoveredNames.set(slug, (s.metadata as { name?: string }).name ?? slug)
  const known = buildKnown(discoveredNames)

  // 2. Relacionadas genéricas
  const related = await collectGoogleRelated(ctx.serpapi, known)
  results.push(related)
  serpApiCalls += related.queriesUsed
  sourcesCollected.google_related = !related.error && related.destinations.size > 0
  await ctx.log(`Relacionadas genéricas: ${related.destinations.size} destinos en ${related.lists.length} términos (${related.queriesUsed} llamadas)`, { error: related.error ?? null, top: summarize(related), rising: related.lists.flatMap(l => l.rising.slice(0, 4).map(r => `${l.seed}: ${r.query} ${r.value}`)).slice(0, 12) }, related.error ? 'warning' : 'info')
  await ctx.heartbeat?.()

  // 3. Candidatos = lo más fuerte del descubrimiento + los destinos con paquetes en el catálogo
  const candidateScore = new Map<string, number>()
  for (const r of [autocomplete, related]) {
    for (const [slug, s] of r.destinations) candidateScore.set(slug, Math.max(candidateScore.get(slug) ?? 0, s.normalizedScore))
  }
  const ranked = [...candidateScore.entries()].sort((a, b) => b[1] - a[1]).map(([slug]) => slug)
  const chosen: string[] = ranked.slice(0, TOP_DISCOVERED_FOR_VALIDATION)
  // Catálogo: primero los destinos con más paquetes (es lo que se vende), después por búsqueda.
  const fromCatalog = [...(ctx.catalogCounts ?? new Map<string, number>()).entries()]
    .filter(([slug]) => !chosen.includes(slug))
    .sort((a, b) => b[1] - a[1] || (candidateScore.get(b[0]) ?? 0) - (candidateScore.get(a[0]) ?? 0))
    .map(([slug]) => slug)
  for (const slug of fromCatalog) {
    if (chosen.length >= MAX_TRENDS_CANDIDATES) break
    chosen.push(slug)
  }
  for (const slug of ranked) {
    if (chosen.length >= MAX_TRENDS_CANDIDATES) break
    if (!chosen.includes(slug)) chosen.push(slug)
  }
  const candidates = chosen.map(slug => ({ slug, name: known.names.get(slug) ?? slug }))

  const [trends, youtube] = await Promise.all([
    collectGoogleTrends(ctx.serpapi, candidates),
    collectYoutube(known, ctx.heartbeat),
  ])
  results.push(trends, youtube)
  serpApiCalls += trends.queriesUsed
  sourcesCollected.google_trends = trends.destinations.size > 0 && !trends.error
  sourcesCollected.youtube = !youtube.error && youtube.destinations.size > 0
  await ctx.log(`Google Trends: ${trends.destinations.size} destinos comparados con ${trends.queriesUsed} llamadas (${fromCatalog.length} del catálogo)`, { error: trends.error ?? null, candidates: candidates.map(c => c.name), top: summarize(trends) }, trends.error ? 'warning' : 'info')
  await ctx.log(`YouTube: ${youtube.destinations.size} destinos conocidos con ${youtube.queriesUsed} consultas`, { error: youtube.error ?? null, top: summarize(youtube) }, youtube.error ? 'warning' : 'info')
  await ctx.heartbeat?.()

  // 4. De qué se habla
  const trending = await collectTrendingNow(ctx.serpapi, known)
  results.push(trending)
  serpApiCalls += trending.queriesUsed
  sourcesCollected.trending_now = !trending.error
  await ctx.log(`Tendencias ahora AR: ${trending.items.length} temas de viajes o con destino, ${trending.destinations.size} destinos`, { error: trending.error ?? null, top: trending.items.slice(0, 8).map(i => `${i.query} (${i.volume ?? '?'})`) }, trending.error ? 'warning' : 'info')

  const buzz: TrendBuzz = {
    trendingNow: trending.items,
    related: related.lists,
    youtube: [...youtube.discovered.values()]
      .filter(d => youtube.destinations.has(d.slug))
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 15)
      .map(d => ({ name: known.names.get(d.slug) ?? d.name, slug: d.slug, weight: Math.round(d.weight * 10) / 10, sampleQueries: d.queries.slice(0, 3) })),
  }

  return { results, sourcesCollected, serpApiCalls, buzz }
}
