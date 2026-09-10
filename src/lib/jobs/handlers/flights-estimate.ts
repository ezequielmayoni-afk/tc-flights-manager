import { SABRE_PROVIDER, createSabreShopper, isSabreConfigured } from '@/lib/sabre/client'
import { runEstimate } from '@/lib/vuelos-baratos/estimate'
import { findDestination, parsePairs } from '@/lib/vuelos-baratos/job-payload'
import { getRoute, upsertEstimates } from '@/lib/vuelos-baratos/queries'
import type { EstimateSummary } from '@/lib/vuelos-baratos/types'
import { FLAGS } from '../flags'
import { MANUAL_PRIORITY } from '../lanes'
import type { HandlerDefinition } from '../types'

/**
 * Una tanda de estimaciones de Sabre (BargainFinderMax) para una ruta.
 *
 * Va por el lane `sabre` (uno por vez: la sesión SOAP no es concurrente) y
 * tiene su propio presupuesto (`sabre`, una unidad por búsqueda): si se agota,
 * el job termina `skipped` y mañana se vuelve a encolar. El precio que guarda
 * NO se publica: sólo ordena qué fechas confirma después el barrido contra
 * siviajo.com.
 */
export const flightsEstimateHandler: HandlerDefinition = {
  kind: 'flights.estimate',
  lane: 'sabre',
  flags: [FLAGS.flightsSweep, FLAGS.sabreCalls],
  provider: SABRE_PROVIDER,
  description: 'Vuelos baratos: estima con Sabre (BFM) los pares de fechas de una ruta para elegir cuáles confirma el barrido',
  handler: async ({ db, job, heartbeat, log }) => {
    const routeId = Number(job.payload.routeId)
    if (!Number.isFinite(routeId) || routeId <= 0) return { ok: false, error: 'payload.routeId obligatorio', retry: false }

    const pairs = parsePairs(job.payload.pairs)
    if (!pairs) return { ok: false, error: 'payload.pairs debe ser una lista de { depart, return, nights }', retry: false }

    // `sabreConfig()` lanza sin credenciales: mejor omitir el job que fallarlo.
    if (!isSabreConfigured()) return { ok: false, skipped: true, reason: 'Sabre no está configurado (faltan las SABRE_*)' }

    const route = await getRoute(db, routeId)
    if (!route) return { ok: false, error: `La ruta ${routeId} no existe`, retry: false }

    const destination = await findDestination(db, route, job.payload.slug)
    if (!destination) return { ok: false, error: `El destino ${route.destination_code} no está publicado en la landing`, retry: false }

    // Una ruta apagada después de encolar no se estima; a mano sí (es una prueba).
    if ((!route.active || !destination.active) && job.priority < MANUAL_PRIORITY) {
      return { ok: false, skipped: true, reason: `Ruta ${route.origin_tc_code}→${destination.code} inactiva` }
    }

    const shopper = createSabreShopper(db, { jobId: job.id })
    let summary: EstimateSummary
    try {
      summary = await runEstimate(
        {
          shop: input => shopper.shop(input),
          save: rows => upsertEstimates(db, rows),
          heartbeat,
          log,
        },
        { route, destination, pairs, jobId: job.id }
      )
    } finally {
      // La sesión abierta consume el cupo del PCC hasta que expira sola.
      await shopper.close()
    }

    const result = { ...summary, sabreCalls: shopper.callsMade }
    const meses = Array.isArray(job.payload.months) ? job.payload.months.join(', ') : ''
    const etiqueta = `${route.origin_tc_code}→${destination.code} ${meses}`.trim()
    await log(
      `Estimación ${etiqueta}: ${summary.ok}/${summary.pairs} pares con precio` +
        `${summary.minPrice !== null ? `, desde USD ${summary.minPrice}` : ''}`,
      { routeId: route.id, ...result },
      summary.errors > 0 ? 'warning' : 'info'
    )

    if (summary.fatalError) return { ok: false, error: summary.fatalError, retry: false, result }
    if (summary.budgetStopped) {
      return { ok: false, skipped: true, reason: `presupuesto sabre agotado (${summary.pairs}/${pairs.length} pares estimados)` }
    }
    if (summary.errors > summary.pairs / 2) {
      return { ok: false, error: 'Más de la mitad de las búsquedas de Sabre fallaron', retry: true, result }
    }
    return { ok: true, result }
  },
}
