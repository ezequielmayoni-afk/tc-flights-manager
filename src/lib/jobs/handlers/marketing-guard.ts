import { runMarketingGuard } from '@/lib/marketing/guard/evaluate'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Guard de marketing: anuncios de paquetes vencidos, no visibles, inactivos
 * en TC o con cupo agotado; precio distinto al de la creatividad; bajo
 * rendimiento. Qué hace con cada caso depende del modo (shadow/semi/auto).
 */
export const marketingGuardHandler: HandlerDefinition = {
  kind: 'marketing.guard',
  lane: 'meta',
  flags: [FLAGS.metaWrites],
  description: 'Guard: decide (y en semi/auto aplica) pausas, redirecciones y pedidos de creatividad sobre los anuncios activos',
  handler: async ({ db, job, log }) => {
    const packageIds = Array.isArray(job.payload.packageIds) ? (job.payload.packageIds as number[]).filter(n => Number.isInteger(n)) : undefined
    const summary = await runMarketingGuard(db, { packageIds, jobId: job.id, log })
    return { ok: true, result: { ...summary } }
  },
}
