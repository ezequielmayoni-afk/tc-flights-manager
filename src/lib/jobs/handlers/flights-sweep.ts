import { COTIZADOR_PROBE_PROVIDER, isCotizadorConfigured, probeFlights } from '@/lib/cotizador/client'
import { isValidIsoDate } from '@/lib/vuelos-baratos/date-pairs'
import { getLandingDestinationBySlug, getRoute, insertProbe, listLandingDestinations } from '@/lib/vuelos-baratos/queries'
import { runSweep } from '@/lib/vuelos-baratos/sweep'
import type { DatePair, LandingDestinationRow, LandingRouteRow } from '@/lib/vuelos-baratos/types'
import { FLAGS } from '../flags'
import { MANUAL_PRIORITY } from '../lanes'
import type { Db, HandlerDefinition } from '../types'

/** Los pares vienen del payload del job: puede haberlos escrito una mano. */
function parsePairs(value: unknown): DatePair[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  const pairs: DatePair[] = []
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null
    const { depart, return: vuelta, nights } = raw as { depart?: unknown; return?: unknown; nights?: unknown }
    if (typeof depart !== 'string' || !isValidIsoDate(depart)) return null
    if (typeof vuelta !== 'string' || !isValidIsoDate(vuelta)) return null
    if (typeof nights !== 'number' || !Number.isFinite(nights) || nights <= 0) return null
    pairs.push({ depart, return: vuelta, nights })
  }
  return pairs
}

/** El slug del payload es un atajo; la verdad es `route.destination_code`. */
async function findDestination(db: Db, route: LandingRouteRow, slug: unknown): Promise<LandingDestinationRow | null> {
  if (typeof slug === 'string' && slug) {
    const porSlug = await getLandingDestinationBySlug(db, slug)
    if (porSlug && porSlug.code === route.destination_code) return porSlug
  }
  const todos = await listLandingDestinations(db)
  return todos.find(d => d.code === route.destination_code) ?? null
}

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
