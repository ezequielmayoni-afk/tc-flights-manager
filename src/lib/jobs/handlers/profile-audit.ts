import { runProfileAudit } from '@/lib/producto/audit'
import type { HandlerDefinition } from '../types'

/** Semanal: cada paquete activo contra los usos y costumbres de su destino. Sólo informa. */
export const profileAuditHandler: HandlerDefinition = {
  kind: 'profile.audit',
  lane: 'default',
  description: 'Auditoría de perfiles: asigna destination_profile_code / family a los paquetes activos y marca desvíos (régimen, noches, estrellas)',
  handler: async ({ db, log }) => {
    const summary = await runProfileAudit(db, log)
    return { ok: true, result: { ...summary, unmatched: summary.unmatched.length } }
  },
}
