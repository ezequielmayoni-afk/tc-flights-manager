import { getCupoPackageIds } from '@/lib/packages/cupo'
import { FLAGS } from '../flags'
import { enqueueJob } from '../queue'
import type { HandlerDefinition } from '../types'

/** Segundos por cotización, para agendar el aviso después de la última. */
const SECONDS_PER_QUOTE = 75
const NOTIFY_SLACK_MINUTES = 5

/**
 * Planifica el monitoreo nocturno: un job `package.requote` por paquete
 * monitoreado y activo (los de cupo se saltean: el aéreo es de contrato), y
 * al final un `package.requote.notify` que manda el resumen a Slack.
 */
export const packageRequotePlanHandler: HandlerDefinition = {
  kind: 'package.requote.plan',
  lane: 'default',
  flags: [FLAGS.cotizadorCalls],
  description: 'Monitoreo de precio: encola la recotización nocturna de todos los paquetes monitoreados',
  handler: async ({ db, job, log }) => {
    const day = String(job.payload.day ?? new Date().toISOString().slice(0, 10))
    const { data } = await db.from('packages').select('id, tc_package_id').eq('monitor_enabled', true).eq('tc_active', true).order('id')
    const rows = (data ?? []) as Array<{ id: number; tc_package_id: number }>
    const cupos = await getCupoPackageIds(db, rows.map(r => r.id))
    const targets = rows.filter(r => !cupos.has(r.id))
    let queued = 0
    let deduped = 0
    for (const r of targets) {
      const result = await enqueueJob(db, { kind: 'package.requote', payload: { packageId: r.id, day, trigger: 'cron' }, dedupeKey: `package.requote:${r.id}:${day}`, entityType: 'package', entityId: r.id, createdBy: `job:${job.id}` })
      if (result.deduped) deduped++
      else queued++
    }
    if (targets.length > 0) {
      const runAfter = new Date(Date.now() + (targets.length * SECONDS_PER_QUOTE + NOTIFY_SLACK_MINUTES * 60) * 1000)
      await enqueueJob(db, { kind: 'package.requote.notify', payload: { day }, dedupeKey: `package.requote.notify:${day}`, runAfter, createdBy: `job:${job.id}` })
    }
    await log(`Monitoreo de precio: ${queued} recotizaciones encoladas (${deduped} ya estaban, ${cupos.size} de cupo salteados)`, { day, monitored: rows.length, queued, deduped, cupos: cupos.size })
    return { ok: true, result: { day, monitored: rows.length, queued, deduped, cupos: cupos.size } }
  },
}
