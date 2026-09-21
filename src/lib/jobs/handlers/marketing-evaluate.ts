import { applyEvaluations, evaluatePackages } from '@/lib/marketing/evaluate'
import type { HandlerDefinition } from '../types'

/**
 * Fase 4: cada paquete activo recibe su vía (marketing | manual | web |
 * excluded) con score y motivo. Corre a diario después del import y cuando
 * entran paquetes nuevos; no manda nada a diseño solo: eso lo decide una
 * persona en /tareas (o `auto_approve`, más adelante).
 */
export const marketingEvaluateHandler: HandlerDefinition = {
  kind: 'marketing.evaluate',
  lane: 'default',
  description: 'Criterio marketing vs web: score y vía recomendada por paquete',
  handler: async ({ db, job, log }) => {
    const packageIds = Array.isArray(job.payload.packageIds) ? (job.payload.packageIds as unknown[]).map(Number).filter(Boolean) : undefined
    const { results } = await evaluatePackages(db, { packageIds })
    const applied = await applyEvaluations(db, results)
    const candidates = results.filter(r => !r.inMarketing && r.evaluation.track === 'marketing').sort((a, b) => b.evaluation.score - a.evaluation.score)
    await log(`Criterio marketing: ${applied.updated} paquetes evaluados (${Object.entries(applied.byTrack).map(([k, v]) => `${k} ${v}`).join(', ')}); ${candidates.length} candidato(s) nuevo(s) a marketing${candidates.length ? `: ${candidates.slice(0, 5).map(c => `SIV ${c.tcPackageId} (${c.evaluation.score})`).join(', ')}` : ''}`, { ...applied, candidates: candidates.slice(0, 20).map(c => ({ packageId: c.packageId, tcPackageId: c.tcPackageId, score: c.evaluation.score })) })
    return { ok: true, result: { evaluated: applied.updated, changed: applied.changed, byTrack: applied.byTrack, candidates: candidates.length } }
  },
}
