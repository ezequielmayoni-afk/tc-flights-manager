import { isSabreConfigured } from '@/lib/sabre/client'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { buildEstimateJobs } from '@/lib/vuelos-baratos/estimate'
import { cancelStaleFlightJobs, listLandingDestinations, listRoutes } from '@/lib/vuelos-baratos/queries'
import { FLAGS } from '../flags'
import { enqueueJob } from '../queue'
import type { HandlerDefinition } from '../types'

/**
 * El plan del estimador de Sabre (23:00 UTC = 20:00 ART).
 *
 * Corre dos horas antes que `flights.sweep.plan` a propósito: la tanda avanza a
 * ~1 job por tick (el runner toma uno por lane y por minuto), así que necesita
 * ese margen para que el barrido de la 01:00 encuentre las estimaciones de hoy
 * ya guardadas. No le pide nada a Sabre: sólo encola un `flights.estimate` por
 * ruta activa × grupo de meses en el lane `sabre` (uno por vez).
 */
export const flightsEstimatePlanHandler: HandlerDefinition = {
  kind: 'flights.estimate.plan',
  lane: 'default',
  flags: [FLAGS.flightsSweep, FLAGS.sabreCalls],
  description: 'Vuelos baratos: planifica las estimaciones de Sabre (un job por ruta × meses) que elige qué fechas confirma el barrido',
  handler: async ({ db, job, log }) => {
    // Sin credenciales el estimador no existe: la noche sigue con pares fijos.
    if (!isSabreConfigured()) return { ok: false, skipped: true, reason: 'Sabre no está configurado (faltan las SABRE_*)' }

    const today = new Date()
    const day = String(job.payload.day ?? todayIso(today))
    const cancelledStale = await cancelStaleFlightJobs(db, 'flights.estimate', day)

    const routes = await listRoutes(db, { activeOnly: true })
    if (routes.length === 0) {
      await log('Vuelos baratos: no hay rutas activas, no se encoló ninguna estimación', { day, cancelledStale })
      return { ok: true, result: { routes: 0, jobs: 0 } }
    }

    const destinations = await listLandingDestinations(db, { activeOnly: true })
    const inputs = buildEstimateJobs({ routes, destinations, today, day, trigger: 'cron' })

    let deduped = 0
    for (const input of inputs) {
      const result = await enqueueJob(db, input)
      if (result.deduped) deduped++
    }

    const pares = inputs.reduce((acc, i) => acc + (i.payload!.pairs as unknown[]).length, 0)
    await log(
      `Vuelos baratos: ${inputs.length - deduped} estimaciones encoladas (${pares} pares) para ${routes.length} rutas` +
        `${deduped ? `, ${deduped} ya estaban en cola` : ''}${cancelledStale ? `, ${cancelledStale} de noches anteriores canceladas` : ''}`,
      { day, routes: routes.length, jobs: inputs.length, pairs: pares, deduped, cancelledStale }
    )

    return { ok: true, result: { routes: routes.length, jobs: inputs.length, pairs: pares, deduped, cancelledStale } }
  },
}
