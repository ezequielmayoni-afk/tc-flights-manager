import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { cancelStaleFlightJobs, getEstimatesForRoutes, listLandingDestinations, listRoutes } from '@/lib/vuelos-baratos/queries'
import { buildSweepJobs } from '@/lib/vuelos-baratos/sweep'
import { FLAGS } from '../flags'
import { enqueueJob } from '../queue'
import type { HandlerDefinition } from '../types'

/**
 * El plan del barrido nocturno de vuelos.siviajo.com (01:00 UTC = 22:00 ART).
 *
 * No sondea nada: arma la cola de la noche (un `flights.sweep` por ruta activa
 * × mes × tanda de 10 pares) y la deja lista para el lane `cotizador`, que
 * corre de a uno hasta las 10:00 UTC. Antes cancela lo que quedó en cola de
 * noches anteriores: esos precios ya no sirven y taparían la cola.
 *
 * Corre una hora después de `flights.estimate.plan`: donde Sabre alcanzó a
 * estimar, la noche confirma esas fechas (`monthsFromEstimates`); donde no,
 * usa los pares fijos de siempre (`monthsFixed`).
 */
export const flightsSweepPlanHandler: HandlerDefinition = {
  kind: 'flights.sweep.plan',
  lane: 'default',
  flags: [FLAGS.flightsSweep],
  description: 'Vuelos baratos: planifica el barrido nocturno (un job por ruta × mes) para vuelos.siviajo.com',
  handler: async ({ db, job, log }) => {
    const today = new Date()
    const day = String(job.payload.day ?? todayIso(today))
    const cancelledStale = await cancelStaleFlightJobs(db, 'flights.sweep', day)

    const routes = await listRoutes(db, { activeOnly: true })
    if (routes.length === 0) {
      await log('Vuelos baratos: no hay rutas activas, no se encoló ningún barrido', { day, cancelledStale })
      return { ok: true, result: { routes: 0, jobs: 0 } }
    }

    const destinations = await listLandingDestinations(db, { activeOnly: true })
    const estimatesByRoute = await getEstimatesForRoutes(
      db,
      routes.map(r => r.id),
      { fromDate: todayIso(today) }
    )
    const inputs = buildSweepJobs({ routes, destinations, today, day, trigger: 'cron', estimatesByRoute })

    // Un mes puede tener varias tandas: se cuenta el mes, no el job.
    const meses = new Map<string, 'estimate' | 'fixed'>()
    for (const input of inputs) {
      meses.set(`${input.payload!.routeId}:${input.payload!.month}`, input.payload!.source as 'estimate' | 'fixed')
    }
    const monthsFromEstimates = [...meses.values()].filter(s => s === 'estimate').length
    const monthsFixed = meses.size - monthsFromEstimates

    let deduped = 0
    for (const input of inputs) {
      const result = await enqueueJob(db, input)
      if (result.deduped) deduped++
    }

    await log(
      `Vuelos baratos: ${inputs.length - deduped} sondeos encolados para ${routes.length} rutas` +
        ` (${monthsFromEstimates} meses con estimación de Sabre, ${monthsFixed} con fechas fijas)` +
        `${deduped ? `, ${deduped} ya estaban en cola` : ''}${cancelledStale ? `, ${cancelledStale} de noches anteriores cancelados` : ''}`,
      { day, routes: routes.length, jobs: inputs.length, deduped, cancelledStale, monthsFromEstimates, monthsFixed }
    )

    return { ok: true, result: { routes: routes.length, jobs: inputs.length, deduped, cancelledStale, monthsFromEstimates, monthsFixed } }
  },
}
