import { collectFx } from './collectors/bcra'
import { collectFeriados } from './collectors/feriados'
import { collectSearchConsole } from './collectors/search-console'
import { isoWeekLabel } from './config'
import type { Db } from '@/lib/jobs/types'

export interface DemandSignalsResult {
  weekLabel: string
  written: number
  sources: Record<string, boolean>
  errors: string[]
}

interface SignalRow {
  week_label: string
  destination_code: string
  source: string
  value: number | null
  metadata: Record<string, unknown>
  job_id: number | null
}

/**
 * Señales macro y propias de la semana → demand_signals_weekly (upsert por
 * semana × destino × fuente, así se puede recorrer más de una vez).
 *
 * - bcra_fx: dólar minorista/mayorista (BCRA) y blue con brecha.
 * - feriados: fines de semana largos en los próximos 120 días.
 * - search_console: impresiones y clics de 28 días por destino semilla.
 * La señal crm_wa se suma en la Fase 8 cuando exista el rollup del CRM.
 */
export async function collectDemandSignals(ctx: {
  db: Db
  jobId: number | null
  log: (message: string, details?: Record<string, unknown>, level?: 'info' | 'warning' | 'error') => Promise<void>
}): Promise<DemandSignalsResult> {
  const { db, jobId, log } = ctx
  const weekLabel = isoWeekLabel()
  const rows: SignalRow[] = []
  const sources: Record<string, boolean> = {}
  const errors: string[] = []

  const fx = await collectFx()
  sources.bcra_fx = fx.minorista.last !== null || fx.mayorista.last !== null
  errors.push(...fx.errors.map(e => `bcra_fx ${e}`))
  if (sources.bcra_fx) {
    rows.push({ week_label: weekLabel, destination_code: '*', source: 'bcra_fx', value: fx.minorista.last ?? fx.mayorista.last, metadata: { ...fx }, job_id: jobId })
  }

  const feriados = await collectFeriados()
  sources.feriados = feriados.feriados.length > 0
  errors.push(...feriados.errors.map(e => `feriados ${e}`))
  if (sources.feriados) {
    const next90 = feriados.longWeekends.filter(lw => lw.daysUntil <= 90)
    rows.push({
      week_label: weekLabel,
      destination_code: '*',
      source: 'feriados',
      value: next90.length,
      metadata: { longWeekends: feriados.longWeekends, feriadosCount: feriados.feriados.length, next: feriados.longWeekends[0] ?? null },
      job_id: jobId,
    })
  }

  const sc = await collectSearchConsole()
  sources.search_console = !sc.error && sc.destinations.size > 0
  if (sc.error) errors.push(`search_console ${sc.error}`)
  if (sources.search_console) {
    let totalImpressions = 0
    let totalClicks = 0
    for (const [slug, signal] of sc.destinations) {
      const meta = signal.metadata as { impressions: number; clicks: number }
      totalImpressions += meta.impressions
      totalClicks += meta.clicks
      rows.push({ week_label: weekLabel, destination_code: slug, source: 'search_console', value: meta.impressions, metadata: signal.metadata, job_id: jobId })
    }
    rows.push({ week_label: weekLabel, destination_code: '*', source: 'search_console', value: totalImpressions, metadata: { impressions: totalImpressions, clicks: totalClicks, destinations: sc.destinations.size }, job_id: jobId })
  }

  if (rows.length > 0) {
    const { error } = await db.from('demand_signals_weekly').upsert(rows, { onConflict: 'week_label,destination_code,source' })
    if (error) throw new Error(`No se pudieron guardar las señales: ${error.message}`)
  }

  await log(`Señales ${weekLabel}: ${rows.length} filas (${Object.entries(sources).filter(([, ok]) => ok).map(([s]) => s).join(', ') || 'ninguna'})`, {
    fx: { minorista: fx.minorista.last, mayorista: fx.mayorista.last, blue: fx.blue.last, brechaPct: fx.blue.brechaPct },
    longWeekends: feriados.longWeekends.slice(0, 3),
    errors,
  }, errors.length ? 'warning' : 'info')

  return { weekLabel, written: rows.length, sources, errors }
}
