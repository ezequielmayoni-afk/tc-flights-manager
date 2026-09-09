import { packagesLinkedToFlight, refreshFlightPackageLinks } from '@/lib/cupos/links'
import { runMarketingGuard } from '@/lib/marketing/guard/evaluate'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Un cupo llegó a 0 (webhook de TC). Refresca los vínculos de los paquetes
 * que lo usan y corre el guard sólo sobre ellos: redirigir a otra salida o
 * pausar, según el grupo y el modo.
 */
export const cupoSoldOutHandler: HandlerDefinition = {
  kind: 'cupo.sold_out',
  lane: 'meta',
  flags: [FLAGS.metaWrites],
  description: 'Cupo agotado: corre el guard sobre los paquetes vinculados al vuelo',
  handler: async ({ db, job, log }) => {
    const flightId = Number(job.payload.flightId)
    if (!flightId) return { ok: false, error: 'payload.flightId obligatorio', retry: false }
    let packageIds = await packagesLinkedToFlight(db, flightId)
    if (packageIds.length === 0) {
      // Puede que el matcheo nunca haya corrido para este vuelo: se recalcula sobre todos los activos.
      await refreshFlightPackageLinks(db)
      packageIds = await packagesLinkedToFlight(db, flightId)
    }
    if (packageIds.length === 0) {
      await log(`Cupo agotado (vuelo ${flightId}) sin paquetes vinculados`, { flightId }, 'warning')
      return { ok: true, result: { flightId, packages: 0 } }
    }
    await refreshFlightPackageLinks(db, packageIds)
    const summary = await runMarketingGuard(db, { packageIds, jobId: job.id, log })
    return { ok: true, result: { flightId, packages: packageIds.length, ...summary } }
  },
}
