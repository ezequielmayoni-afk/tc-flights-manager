import type { Db, JobRow } from '@/lib/jobs/types'
import type { AlertSeverity, AlertType, Classification, Momentum, RelatedQuery, TrendBuzz } from './types'

/** Lecturas para la pantalla y la API de Tendencias. */

export interface TrendRunRow {
  id: string
  week_label: string
  trigger: 'cron' | 'manual'
  status: 'running' | 'completed' | 'failed'
  sources_collected: Record<string, boolean>
  buzz: Partial<TrendBuzz> | null
  catalog_snapshot_count: number
  duration_ms: number | null
  error: string | null
  job_id: number | null
  started_at: string
  completed_at: string | null
  created_at: string
}

export interface TrendDestinationRow {
  id: string
  destination: string
  destination_slug: string
  region: string
  trend_score: number
  rank: number
  signal_google_trends: number
  signal_autocomplete: number
  signals: Record<string, number>
  /** Evidencia por fuente: consultas de ejemplo, valores crudos, plantillas de Trends. */
  raw_signals: Record<string, Record<string, unknown>>
  prev_week_score: number | null
  change_pct: number | null
  momentum: Momentum
  has_packages: boolean
  matching_package_count: number
  matching_package_ids: number[]
  cheapest_package_price: number | null
  classification: Classification
  related_queries: RelatedQuery[]
}

export interface TrendAlertRow {
  id: string
  trend_run_id: string
  destination: string
  alert_type: AlertType
  severity: AlertSeverity
  title: string
  description: string | null
  source: string | null
  data: Record<string, unknown>
  acknowledged: boolean
  action_taken: 'idea_created' | 'dismissed' | 'superseded' | null
  dedupe_key: string | null
  acknowledged_by: string | null
  acknowledged_at: string | null
  idea_id: number | null
  created_at: string
}

export interface DemandSignalRow {
  week_label: string
  destination_code: string
  source: string
  value: number | null
  metadata: Record<string, unknown>
  collected_at: string
}

const DESTINATION_COLUMNS = 'id, destination, destination_slug, region, trend_score, rank, signal_google_trends, signal_autocomplete, signals, raw_signals, prev_week_score, change_pct, momentum, has_packages, matching_package_count, matching_package_ids, cheapest_package_price, classification, related_queries'

export async function listRuns(db: Db, limit = 12): Promise<TrendRunRow[]> {
  const { data } = await db.from('trend_runs').select('*').order('created_at', { ascending: false }).limit(limit)
  return (data ?? []) as TrendRunRow[]
}

/** La corrida pedida, o la última completada. */
export async function getRun(db: Db, runId?: string | null): Promise<TrendRunRow | null> {
  const query = runId
    ? db.from('trend_runs').select('*').eq('id', runId)
    : db.from('trend_runs').select('*').eq('status', 'completed').order('created_at', { ascending: false }).limit(1)
  const { data } = await query.maybeSingle()
  return (data as TrendRunRow | null) ?? null
}

export async function getRunDestinations(db: Db, runId: string): Promise<TrendDestinationRow[]> {
  const { data } = await db.from('trend_destinations').select(DESTINATION_COLUMNS).eq('trend_run_id', runId).order('rank', { ascending: true })
  return ((data ?? []) as unknown as TrendDestinationRow[]).map(d => ({
    ...d,
    trend_score: Number(d.trend_score),
    signal_google_trends: Number(d.signal_google_trends),
    signal_autocomplete: Number(d.signal_autocomplete),
    signals: d.signals && typeof d.signals === 'object' ? d.signals : { google_trends: Number(d.signal_google_trends), autocomplete: Number(d.signal_autocomplete) },
    prev_week_score: d.prev_week_score === null ? null : Number(d.prev_week_score),
    change_pct: d.change_pct === null ? null : Number(d.change_pct),
    cheapest_package_price: d.cheapest_package_price === null ? null : Number(d.cheapest_package_price),
    related_queries: Array.isArray(d.related_queries) ? d.related_queries : [],
    raw_signals: d.raw_signals && typeof d.raw_signals === 'object' ? d.raw_signals : {},
  }))
}

export async function getRunAlerts(db: Db, runId: string): Promise<TrendAlertRow[]> {
  const { data } = await db.from('trend_alerts').select('*').eq('trend_run_id', runId).order('created_at', { ascending: false })
  return (data ?? []) as TrendAlertRow[]
}

/** Alertas sin cerrar de cualquier corrida, las más graves primero. */
export async function getOpenAlerts(db: Db, limit = 50): Promise<TrendAlertRow[]> {
  const { data } = await db.from('trend_alerts').select('*').eq('acknowledged', false).order('created_at', { ascending: false }).limit(limit)
  const order: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return ((data ?? []) as TrendAlertRow[]).sort((a, b) => order[a.severity] - order[b.severity] || b.created_at.localeCompare(a.created_at))
}

export interface LatestSignals {
  fx: DemandSignalRow | null
  feriados: DemandSignalRow | null
}

/** Última semana con datos de cada señal macro. */
export async function getLatestSignals(db: Db): Promise<LatestSignals> {
  const latest = async (source: string): Promise<DemandSignalRow | null> => {
    const { data } = await db.from('demand_signals_weekly').select('*').eq('source', source).eq('destination_code', '*').order('week_label', { ascending: false }).limit(1).maybeSingle()
    return (data as DemandSignalRow | null) ?? null
  }
  const [fx, feriados] = await Promise.all([latest('bcra_fx'), latest('feriados')])
  return { fx, feriados }
}

/** Job de Tendencias en cola o corriendo, si hay. */
export async function getPendingTrendJob(db: Db): Promise<JobRow | null> {
  const { data } = await db.from('hub_jobs').select('*').eq('kind', 'trend.run').in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1).maybeSingle()
  return (data as JobRow | null) ?? null
}
