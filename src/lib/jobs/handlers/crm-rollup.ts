import { runCrmRollup } from '@/lib/crm/rollup'
import { isCrmConfigured } from '@/lib/crm/pool'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Fase 8: rollup nocturno del CRM (sólo lectura, pool de 2, transacción READ
 * ONLY, tenant + rango). Reprocesa los últimos `days` (7 por defecto) para
 * capturar oportunidades que cambiaron de etapa después del primer contacto.
 */
export const crmRollupHandler: HandlerDefinition = {
  kind: 'crm.rollup',
  lane: 'crm',
  flags: [FLAGS.crmReads],
  description: 'Cruza mensajes con código SIV, clicks de anuncios, vendedores y oportunidades del CRM; agrega por paquete y día',
  handler: async ({ db, job, log, heartbeat }) => {
    if (!isCrmConfigured()) return { ok: false, error: 'CRM no configurado en el VPS (CRM_PG_*)', retry: false }
    const days = Math.min(90, Math.max(1, Number(job.payload.days ?? 7)))
    await heartbeat?.()
    const r = await runCrmRollup(db, { days, log: m => log(m) })
    await log(`Rollup CRM ${r.from} → ${r.to}: ${r.sivMessages} mensajes SIV, ${r.contacts} contactos, ${r.records} atribuciones (${r.withAd} con anuncio), ${r.dailyRows} filas diarias, ${r.spendRows} filas de gasto, ${Math.round(r.durationMs / 1000)} s`, r as unknown as Record<string, unknown>)
    return { ok: true, result: r as unknown as Record<string, unknown> }
  },
}
