import { evaluateCupoRisk } from '@/lib/cupos/risk'
import type { HandlerDefinition } from '../types'

/** Diario: semáforo de riesgo por cupo (flights.risk_level) y aviso a Slack de los que empeoraron. */
export const cupoRiskEvalHandler: HandlerDefinition = {
  kind: 'cupo.risk_eval',
  lane: 'default',
  description: 'Evalúa el riesgo de cada cupo futuro (lugares sin vender vs. días a la salida) y avisa los que empeoran',
  handler: async ({ db, log }) => {
    const r = await evaluateCupoRisk(db, { systemUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com' })
    await log(`Riesgo de cupos: ${r.evaluated} salidas, ${r.red} rojas, ${r.yellow} amarillas, ${r.worsened} empeoraron${r.notified ? ' (avisado en Slack)' : ''}`, r as unknown as Record<string, unknown>)
    return { ok: true, result: r as unknown as Record<string, unknown> }
  },
}
