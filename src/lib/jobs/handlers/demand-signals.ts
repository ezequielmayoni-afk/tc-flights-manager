import { collectDemandSignals } from '@/lib/tendencias/demand-signals'
import type { HandlerDefinition } from '../types'

/**
 * Señales macro y propias de la semana (dólar, feriados, Search Console).
 * Todo gratis y sin clave: no tiene proveedor ni flag propio.
 */
export const demandSignalsHandler: HandlerDefinition = {
  kind: 'demand.signals',
  lane: 'default',
  description: 'Señales de demanda semanales: tipo de cambio (BCRA), fines de semana largos y Search Console → demand_signals_weekly',
  handler: async ({ db, job, log }) => {
    const result = await collectDemandSignals({ db, jobId: job.id, log })
    const anySource = Object.values(result.sources).some(Boolean)
    if (!anySource) {
      return { ok: false, error: `Ninguna fuente respondió: ${result.errors.join('; ')}`, result: { ...result } }
    }
    return { ok: true, result: { ...result } }
  },
}
