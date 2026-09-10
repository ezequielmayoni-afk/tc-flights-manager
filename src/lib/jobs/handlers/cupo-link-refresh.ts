import { refreshFlightPackageLinks } from '@/lib/cupos/links'
import { refreshDepartureGroups } from '@/lib/cupos/departure-groups'
import type { HandlerDefinition } from '../types'

/** Recalcula y persiste el matcheo cupo ↔ paquete y los grupos de salidas (diario). */
export const cupoLinkRefreshHandler: HandlerDefinition = {
  kind: 'cupo.link_refresh',
  lane: 'default',
  description: 'Vínculos cupo ↔ paquete: recalcula el matcheo y lo guarda en flight_package_links',
  handler: async ({ db, job, log }) => {
    const packageIds = Array.isArray(job.payload.packageIds) ? (job.payload.packageIds as number[]) : undefined
    const r = await refreshFlightPackageLinks(db, packageIds)
    const g = await refreshDepartureGroups(db)
    await log(`Vínculos cupo↔paquete: ${r.upserted} vínculos en ${r.packagesWithLinks} de ${r.scanned} paquetes · grupos de salidas: ${g.groups} grupos, ${g.grouped} paquetes, ${g.changed} cambios`, { links: r, groups: g })
    return { ok: true, result: { ...r, groups: g } }
  },
}
