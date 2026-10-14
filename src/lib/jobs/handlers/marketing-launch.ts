import { activateLaunchedPackage, launchPackage } from '@/lib/meta-ads/launch'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/** Fase 5: crea conjunto (desde la plantilla de la familia) y anuncios en pausa para un paquete con creativos listos. */
export const marketingLaunchHandler: HandlerDefinition = {
  kind: 'marketing.launch',
  lane: 'meta',
  flags: [FLAGS.metaWrites],
  description: 'Lanza un paquete en Meta: conjunto desde la plantilla de su familia + anuncios en pausa',
  handler: async ({ db, job, log }) => {
    const packageId = Number(job.payload.packageId)
    if (!packageId) return { ok: false, error: 'payload.packageId obligatorio', retry: false }
    const actor = typeof job.payload.actor === 'string' ? job.payload.actor : `job:${job.id}`
    try {
      const r = await launchPackage(db, packageId, { actor, log: msg => log(msg) })
      await log(`Lanzado ${r.tcPackageId}: ${r.adsCreated} anuncio(s) nuevo(s) en ${r.adsetName}${r.warnings.length ? ` · avisos: ${r.warnings.join(' | ')}` : ''}`, r as unknown as Record<string, unknown>)
      return { ok: true, result: r as unknown as Record<string, unknown> }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await log(`Lanzamiento falló: ${message}`, { packageId }, 'error')
      return { ok: false, error: message, retry: /rate limit|timeout|ECONNRESET|503|502/i.test(message) }
    }
  },
}

/** El clic humano: activa el conjunto y los anuncios que HUB dejó en pausa. */
export const marketingActivateHandler: HandlerDefinition = {
  kind: 'marketing.activate',
  lane: 'meta',
  flags: [FLAGS.metaWrites],
  description: 'Activa el conjunto y los anuncios lanzados desde HUB para un paquete',
  handler: async ({ db, job, log }) => {
    const packageId = Number(job.payload.packageId)
    if (!packageId) return { ok: false, error: 'payload.packageId obligatorio', retry: false }
    const actor = typeof job.payload.actor === 'string' ? job.payload.actor : `job:${job.id}`
    try {
      const r = await activateLaunchedPackage(db, packageId, { actor })
      await log(`Activado: conjunto ${r.adsetId}, ${r.adsActivated} anuncio(s)`, r as unknown as Record<string, unknown>)
      return { ok: true, result: r as unknown as Record<string, unknown> }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await log(`Activación falló: ${message}`, { packageId }, 'error')
      return { ok: false, error: message, retry: false }
    }
  },
}
