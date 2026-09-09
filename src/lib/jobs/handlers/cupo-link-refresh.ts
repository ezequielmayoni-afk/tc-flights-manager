import { refreshFlightPackageLinks } from '@/lib/cupos/links'
import type { HandlerDefinition } from '../types'

/** Recalcula y persiste el matcheo cupo ↔ paquete (diario). */
export const cupoLinkRefreshHandler: HandlerDefinition = {
  kind: 'cupo.link_refresh',
  lane: 'default',
  description: 'Vínculos cupo ↔ paquete: recalcula el matcheo y lo guarda en flight_package_links',
  handler: async ({ db, job, log }) => {
    const packageIds = Array.isArray(job.payload.packageIds) ? (job.payload.packageIds as number[]) : undefined
    const r = await refreshFlightPackageLinks(db, packageIds)
    await log(`Vínculos cupo↔paquete: ${r.upserted} vínculos en ${r.packagesWithLinks} de ${r.scanned} paquetes`, { ...r })
    return { ok: true, result: { ...r } }
  },
}
