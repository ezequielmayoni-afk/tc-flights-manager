import { syncMetaInsights } from '@/lib/meta-ads/insights-sync'
import { enqueueJob } from '../queue'
import type { HandlerDefinition } from '../types'
import type { DatePreset } from '@/lib/meta-ads/types'

/**
 * Sincroniza insights de Meta. Cada hora hoy y ayer; una vez al día los
 * últimos 7; los domingos los últimos 30. Al terminar encola el guard, que
 * necesita el estado real de los anuncios.
 */
export const insightsSyncHandler: HandlerDefinition = {
  kind: 'insights.sync',
  lane: 'meta',
  description: 'Insights de Meta (campañas, conjuntos, anuncios, métricas) → meta_ad_insights; después encola marketing.guard',
  handler: async ({ db, job, log }) => {
    const preset = (typeof job.payload.datePreset === 'string' ? job.payload.datePreset : 'last_7d') as DatePreset
    const result = await syncMetaInsights(db, { datePreset: preset, log })
    if (job.payload.thenGuard !== false) {
      await enqueueJob(db, { kind: 'marketing.guard', payload: { trigger: 'insights.sync' }, dedupeKey: 'marketing.guard:all', createdBy: `job:${job.id}` })
    }
    return { ok: true, result: { ...result, datePreset: preset } }
  },
}
