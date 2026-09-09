import { collectAll } from './collectors'
import { computeScores } from './scoring'
import { loadCatalog, matchCatalog, seedSlugsWithPackages } from './catalog-matcher'
import { classifyDestinations } from './classifier'
import { detectAlerts, detectRisingQueryAlerts } from './alert-detector'
import { isoWeekLabel, PREV_RUN_MAX_AGE_DAYS } from './config'
import type { Db } from '@/lib/jobs/types'
import type { TrendAlert, TrendBuzz, TrendDestination, TrendRunOptions, TrendRunResult } from './types'

const EMPTY_BUZZ: TrendBuzz = { trendingNow: [], related: [], youtube: [] }

const INSERT_BATCH = 50

/**
 * Orquestador de Tendencias. Se ejecuta dentro del job `trend.run`:
 * recolecta → puntúa → cruza con el catálogo → clasifica → alerta → guarda.
 * Con `dryRun` hace todo menos escribir (para probar colectores y scoring).
 */
export async function runTendencias(options: TrendRunOptions): Promise<TrendRunResult> {
  const { db, jobId, trigger, dryRun = false, log } = options
  const weekLabel = isoWeekLabel()
  const started = Date.now()
  let runId: string | null = null

  await log(`Tendencias: arranca corrida ${weekLabel} (${trigger}${dryRun ? ', dry run' : ''})`)

  if (!dryRun) {
    const { data, error } = await db
      .from('trend_runs')
      .insert({ week_label: weekLabel, trigger, status: 'running', job_id: jobId })
      .select('id')
      .single()
    if (error || !data) throw new Error(`No se pudo crear la corrida: ${error?.message ?? 'sin datos'}`)
    runId = data.id as string
  }

  try {
    // El catálogo se lee antes: los destinos con paquetes siempre se comparan en Trends.
    const catalog = await loadCatalog(db)
    const catalogSlugs = seedSlugsWithPackages(catalog)
    const { results, sourcesCollected, serpApiCalls, buzz } = await collectAll({ ...options, catalogSlugs })

    const prev = await getPreviousScores(db, weekLabel)
    await log(prev.reason)

    let destinations = computeScores(results, prev.scores)
    const { destinations: matched, catalogSize } = await matchCatalog(db, destinations, catalog)
    destinations = classifyDestinations(matched)
    const alerts = detectAlerts(destinations)
    alerts.push(...detectRisingQueryAlerts(buzz.related, destinations, alerts))
    await options.heartbeat?.()

    const withPackages = destinations.filter(d => d.hasPackages).length
    const opportunities = destinations.filter(d => d.classification === 'opportunity').length
    const gaps = destinations.filter(d => d.classification === 'gap').length

    if (!dryRun && runId) await persist(db, runId, destinations, alerts, buzz)

    const durationMs = Date.now() - started
    if (!dryRun && runId) {
      await db.from('trend_runs').update({
        status: 'completed',
        sources_collected: sourcesCollected,
        buzz,
        catalog_snapshot_count: withPackages,
        duration_ms: durationMs,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
    }

    await log(
      `Tendencias ${weekLabel}: ${destinations.length} destinos, ${opportunities} oportunidades, ${gaps} huecos, ${alerts.length} alertas`,
      { runId, serpApiCalls, catalogSize, withPackages, durationMs, sourcesCollected, top10: destinations.slice(0, 10).map(d => `${d.destination}:${d.trendScore}`) }
    )

    return { runId, weekLabel, status: 'completed', destinations, alerts, buzz, sourcesCollected, catalogSnapshotCount: withPackages, serpApiCalls, durationMs }
  } catch (err) {
    const durationMs = Date.now() - started
    const message = err instanceof Error ? err.message : String(err)
    if (!dryRun && runId) {
      await db.from('trend_runs').update({ status: 'failed', error: message, duration_ms: durationMs, completed_at: new Date().toISOString() }).eq('id', runId)
    }
    await log(`Tendencias ${weekLabel} falló: ${message}`, { runId, durationMs }, 'error')
    return { runId, weekLabel, status: 'failed', destinations: [], alerts: [], buzz: EMPTY_BUZZ, sourcesCollected: {}, catalogSnapshotCount: 0, serpApiCalls: options.serpapi.callsMade, durationMs, error: message }
  }
}

/**
 * Scores de la corrida anterior para el momentum. Sólo sirve una corrida
 * reciente: contra una de hace meses todo parece "surging" o "falling".
 */
async function getPreviousScores(db: Db, currentWeek: string): Promise<{ scores: Map<string, number>; reason: string }> {
  const scores = new Map<string, number>()
  const { data: prevRun } = await db
    .from('trend_runs')
    .select('id, week_label, created_at')
    .eq('status', 'completed')
    .lt('week_label', currentWeek)
    .order('week_label', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!prevRun) return { scores, reason: 'Sin corrida anterior: todos los destinos son nuevos' }
  const ageDays = (Date.now() - new Date(prevRun.created_at as string).getTime()) / 86_400_000
  if (ageDays > PREV_RUN_MAX_AGE_DAYS) {
    return { scores, reason: `La corrida anterior (${prevRun.week_label}) tiene ${Math.round(ageDays)} días: no se calcula momentum` }
  }

  const { data: prevDests } = await db
    .from('trend_destinations')
    .select('destination_slug, trend_score')
    .eq('trend_run_id', prevRun.id)
  for (const d of (prevDests ?? []) as Array<{ destination_slug: string; trend_score: number }>) {
    scores.set(d.destination_slug, Number(d.trend_score))
  }
  return { scores, reason: `Momentum contra ${prevRun.week_label} (${scores.size} destinos)` }
}

async function persist(db: Db, runId: string, destinations: TrendDestination[], alerts: TrendAlert[], buzz: TrendBuzz): Promise<void> {
  void buzz // se guarda en trend_runs al completar
  const rows = destinations.map(d => ({
    trend_run_id: runId,
    destination: d.destination,
    destination_slug: d.destinationSlug,
    region: d.region,
    trend_score: d.trendScore,
    rank: d.rank,
    signals: d.signals,
    // Columnas fijas heredadas de media-os; search_console ya no se usa.
    signal_google_trends: d.signals.google_trends ?? 0,
    signal_autocomplete: d.signals.autocomplete ?? 0,
    signal_search_console: 0,
    signal_amadeus_price: 0,
    signal_news_events: 0,
    signal_reddit: 0,
    prev_week_score: d.prevWeekScore,
    change_pct: d.changePct,
    momentum: d.momentum,
    has_packages: d.hasPackages,
    matching_package_count: d.matchingPackageCount,
    matching_package_ids: d.matchingPackageIds,
    cheapest_package_price: d.cheapestPackagePrice,
    classification: d.classification,
    related_queries: d.relatedQueries,
    raw_signals: d.rawSignals,
  }))

  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const { error } = await db.from('trend_destinations').insert(rows.slice(i, i + INSERT_BATCH))
    if (error) throw new Error(`No se pudieron guardar los destinos: ${error.message}`)
  }

  if (alerts.length > 0) {
    const { error } = await db.from('trend_alerts').insert(alerts.map(a => ({
      trend_run_id: runId,
      destination: a.destination,
      alert_type: a.alertType,
      severity: a.severity,
      title: a.title,
      description: a.description,
      source: a.source,
      data: a.data,
    })))
    if (error) throw new Error(`No se pudieron guardar las alertas: ${error.message}`)
  }
}
