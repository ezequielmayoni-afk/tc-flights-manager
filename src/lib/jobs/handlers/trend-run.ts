import { createSerpApiClient, SERPAPI_PROVIDER, SerpApiBudgetExhausted } from '@/lib/serpapi/client'
import { runTendencias } from '@/lib/tendencias/run'
import { FLAGS } from '../flags'
import { MANUAL_PRIORITY } from '../lanes'
import type { HandlerDefinition } from '../types'

/**
 * Corrida semanal de Tendencias (lunes 08:00 UTC) o manual desde la pantalla.
 * Va por el lane `serpapi` (una por vez) y respeta el presupuesto del
 * proveedor: ~8 llamadas por corrida.
 */
export const trendRunHandler: HandlerDefinition = {
  kind: 'trend.run',
  lane: 'serpapi',
  flags: [FLAGS.serpapiCalls],
  provider: SERPAPI_PROVIDER,
  description: 'Tendencias: descubre destinos (Autocomplete), valida con Google Trends (SerpAPI), cruza con el catálogo y genera alertas',
  handler: async ({ db, job, heartbeat, log }) => {
    const trigger = job.payload.trigger === 'manual' || job.priority >= MANUAL_PRIORITY ? 'manual' : 'cron'
    const serpapi = createSerpApiClient({ db, jobId: job.id, usage: 'tendencias' })

    const result = await runTendencias({
      db,
      jobId: job.id,
      serpapi,
      log,
      heartbeat,
      trigger,
      dryRun: job.payload.dryRun === true,
    })

    const summary = {
      runId: result.runId,
      weekLabel: result.weekLabel,
      destinations: result.destinations.length,
      opportunities: result.destinations.filter(d => d.classification === 'opportunity').length,
      gaps: result.destinations.filter(d => d.classification === 'gap').length,
      alerts: result.alerts.length,
      serpApiCalls: result.serpApiCalls,
      catalogSnapshotCount: result.catalogSnapshotCount,
      sourcesCollected: result.sourcesCollected,
      durationMs: result.durationMs,
    }

    if (result.status === 'failed') {
      const budget = result.error?.startsWith(new SerpApiBudgetExhausted(0).message.split(' (')[0]) ?? false
      return { ok: false, error: result.error ?? 'La corrida falló', result: summary, retry: !budget }
    }
    return { ok: true, result: summary }
  },
}
