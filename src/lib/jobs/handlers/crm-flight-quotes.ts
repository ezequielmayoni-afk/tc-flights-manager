import { ingestCrmFlightQuotes } from '@/lib/crm/flight-quotes'
import { isCrmConfigured } from '@/lib/crm/pool'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Cotizaciones del bot del CRM → observaciones de precio de aéreos
 * (`flight_price_probes`, source crm_quote). Sólo lectura en el CRM; corre de
 * noche con el resto de la lane crm y sigue desde el último cursor.
 */
export const crmFlightQuotesHandler: HandlerDefinition = {
  kind: 'crm.flight_quotes',
  lane: 'crm',
  flags: [FLAGS.crmReads],
  description: 'Guarda los aéreos de las cotizaciones del bot del CRM (fecha, precio pp, tarifa, escalas; aerolínea y vuelos de la elegida) como observaciones de precio',
  handler: async ({ db, job, log, heartbeat }) => {
    if (!isCrmConfigured()) return { ok: false, error: 'CRM no configurado en el VPS (CRM_PG_*)', retry: false }
    await heartbeat?.()
    const r = await ingestCrmFlightQuotes(db, { backfillDays: Number(job.payload.backfillDays ?? 60), log: m => { void log(m) } })
    await log(`Cotizaciones del bot ${r.from} → ${r.to}: ${r.logs} cotizaciones, ${r.observations} fechas con precio, ${r.inserted} nuevas, ${r.skipped} ya estaban`, r as unknown as Record<string, unknown>)
    return { ok: true, result: r as unknown as Record<string, unknown> }
  },
}
