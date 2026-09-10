import { COTIZADOR_PROBE_PROVIDER, isCotizadorConfigured, probeFlights } from '@/lib/cotizador/client'
import { findDestination, parsePairs } from '@/lib/vuelos-baratos/job-payload'
import { getRoute, insertProbe } from '@/lib/vuelos-baratos/queries'
import { runSweep } from '@/lib/vuelos-baratos/sweep'
import { FLAGS } from '../flags'
import { MANUAL_PRIORITY } from '../lanes'
import type { HandlerDefinition } from '../types'

/**
 * Una tanda de sondas del barrido de vuelos.siviajo.com.
 *
 * Va por el lane `cotizador` (un worker, ventana 01:00–10:00 UTC) y tiene su
 * propio presupuesto (`cotizador_probe`): si se agota, el job termina
 * `skipped` y mañana se vuelve a encolar. Media tanda fallada se reintenta
 * (el bot puede estar caído un rato); una sonda suelta no.
 */
export const flightsSweepHandler: HandlerDefinition = {
  kind: 'flights.sweep',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls, FLAGS.flightsSweep],
  provider: COTIZADOR_PROBE_PROVIDER,
  description: 'Vuelos baratos: sondea pares de fechas de una ruta en siviajo.com (cotizador-bot) y guarda observaciones',
  handler: async ({ db, job, heartbeat, log }) => {
    const routeId = Number(job.payload.routeId)
    if (!Number.isFinite(routeId) || routeId <= 0) return { ok: false, error: 'payload.routeId obligatorio', retry: false }

    const pairs = parsePairs(job.payload.pairs)
    if (!pairs) return { ok: false, error: 'payload.pairs debe ser una lista de { depart, return, nights }', retry: false }

    // probeFlights lanza sin API key: mejor omitir el job que fallarlo.
    if (!isCotizadorConfigured()) return { ok: false, skipped: true, reason: 'COTIZADOR_API_KEY no está configurada' }

    const route = await getRoute(db, routeId)
    if (!route) return { ok: false, error: `La ruta ${routeId} no existe`, retry: false }

    const destination = await findDestination(db, route, job.payload.slug)
    if (!destination) return { ok: false, error: `El destino ${route.destination_code} no está publicado en la landing`, retry: false }

    // Una ruta apagada después de encolar no se sondea; a mano sí (es una prueba).
    if ((!route.active || !destination.active) && job.priority < MANUAL_PRIORITY) {
      return { ok: false, skipped: true, reason: `Ruta ${route.origin_tc_code}→${destination.code} inactiva` }
    }

    const summary = await runSweep(
      {
        probe: input => probeFlights(db, input, { jobId: job.id }),
        save: row => insertProbe(db, row),
        heartbeat,
        log,
      },
      { route, destination, pairs, jobId: job.id }
    )

    const etiqueta = `${route.origin_tc_code}→${destination.code} ${String(job.payload.month ?? '')}`.trim()
    await log(
      `Vuelos baratos ${etiqueta}: ${summary.ok}/${summary.probes} sondas con precio` +
        `${summary.minPrice !== null ? `, desde USD ${summary.minPrice}` : ''}`,
      { routeId: route.id, ...summary },
      summary.errors + summary.timeouts > 0 ? 'warning' : 'info'
    )

    if (summary.budgetStopped) {
      return { ok: false, skipped: true, reason: `presupuesto cotizador_probe agotado (${summary.probes}/${pairs.length} pares sondeados)` }
    }
    if (summary.errors + summary.timeouts > summary.probes / 2) {
      return { ok: false, error: 'Más de la mitad de las sondas fallaron', retry: true, result: { ...summary } }
    }
    return { ok: true, result: { ...summary } }
  },
}
