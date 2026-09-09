import { collectAutocomplete } from './autocomplete'
import { collectGoogleTrends } from './serpapi-trends'
import { collectSearchConsole } from './search-console'
import { MAX_SERPAPI_CALLS_PER_RUN, TOP_DISCOVERED_FOR_VALIDATION } from '../config'
import type { CollectorResult, TendenciasContext } from '../types'

export interface CollectAllResult {
  results: CollectorResult[]
  sourcesCollected: Record<string, boolean>
  serpApiCalls: number
}

/**
 * Recolección en dos fases:
 *   1. Descubrimiento con Autocomplete (gratis): qué escriben los argentinos.
 *   2. Validación con Google Trends vía SerpAPI (~8 llamadas): scores
 *      comparables + consultas relacionadas para los más mencionados.
 * Search Console se suma como señal propia (peso 0 en el score).
 */
export async function collectAll(ctx: TendenciasContext): Promise<CollectAllResult> {
  const results: CollectorResult[] = []
  const sourcesCollected: Record<string, boolean> = {}
  let serpApiCalls = 0

  const autocomplete = await collectAutocomplete()
  results.push(autocomplete)
  sourcesCollected.autocomplete = !autocomplete.error
  await ctx.log(`Autocomplete: ${autocomplete.destinations.size} destinos descubiertos con ${autocomplete.queriesUsed} consultas`, {
    error: autocomplete.error ?? null,
    top: [...autocomplete.destinations.entries()].sort((a, b) => b[1].rawScore - a[1].rawScore).slice(0, 10).map(([slug, s]) => `${slug}:${s.rawScore}`),
  }, autocomplete.error ? 'warning' : 'info')
  await ctx.heartbeat?.()

  const top = [...autocomplete.destinations.entries()]
    .filter(([, s]) => s.rawScore >= 2)
    .sort((a, b) => b[1].rawScore - a[1].rawScore)
    .slice(0, TOP_DISCOVERED_FOR_VALIDATION)
    .map(([slug, s]) => ({ slug, name: (s.metadata as { name?: string }).name || slug }))

  const trends = await collectGoogleTrends(ctx.serpapi, top, MAX_SERPAPI_CALLS_PER_RUN)
  results.push(trends)
  serpApiCalls += trends.queriesUsed
  sourcesCollected.google_trends = trends.destinations.size > 0 && !trends.error
  await ctx.log(`Google Trends: ${trends.destinations.size} destinos validados con ${trends.queriesUsed} llamadas a SerpAPI`, {
    error: trends.error ?? null,
    validated: top.map(t => t.name),
  }, trends.error ? 'warning' : 'info')
  await ctx.heartbeat?.()

  const searchConsole = await collectSearchConsole()
  results.push(searchConsole)
  sourcesCollected.search_console = !searchConsole.error
  await ctx.log(`Search Console: ${searchConsole.destinations.size} destinos con impresiones`, { error: searchConsole.error ?? null }, searchConsole.error ? 'warning' : 'info')

  sourcesCollected.amadeus_price = false
  sourcesCollected.news_events = false
  sourcesCollected.reddit = false

  return { results, sourcesCollected, serpApiCalls }
}
