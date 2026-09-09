import { applyDecision } from '@/lib/marketing/guard/apply'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/** Aplica una decisión aprobada desde la pantalla (o reintenta una fallida). */
export const adsApplyDecisionHandler: HandlerDefinition = {
  kind: 'ads.apply_decision',
  lane: 'meta',
  flags: [FLAGS.metaWrites],
  description: 'Aplica una decisión de ad_decisions (pausar, redirigir, pedir creatividad, ocultar en TC)',
  handler: async ({ db, job, log }) => {
    const decisionId = Number(job.payload.decisionId)
    if (!decisionId) return { ok: false, error: 'payload.decisionId obligatorio', retry: false }
    const actor = typeof job.payload.actor === 'string' ? job.payload.actor : `job:${job.id}`
    const r = await applyDecision(db, decisionId, actor)
    await log(r.ok ? `Decisión #${decisionId} aplicada` : `Decisión #${decisionId} falló: ${r.error}`, { decisionId, result: r.result ?? null }, r.ok ? 'info' : 'error')
    return r.ok ? { ok: true, result: { decisionId, ...r.result } } : { ok: false, error: r.error ?? 'falló', retry: false }
  },
}
