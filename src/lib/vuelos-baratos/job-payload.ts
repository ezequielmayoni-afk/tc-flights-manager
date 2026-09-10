import type { Db } from '@/lib/jobs/types'
import { isValidIsoDate } from './date-pairs'
import { getLandingDestinationBySlug, listLandingDestinations } from './queries'
import type { DatePair, LandingDestinationRow, LandingRouteRow } from './types'

/**
 * Lo que comparten los handlers de vuelos.siviajo.com (`flights.sweep` y
 * `flights.estimate`) para leer su payload: los pares y el destino pueden
 * venir de un job encolado hace horas, o escritos a mano desde la cola.
 */

/** Los pares vienen del payload del job: puede haberlos escrito una mano. */
export function parsePairs(value: unknown): DatePair[] | null {
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
export async function findDestination(db: Db, route: LandingRouteRow, slug: unknown): Promise<LandingDestinationRow | null> {
  if (typeof slug === 'string' && slug) {
    const porSlug = await getLandingDestinationBySlug(db, slug)
    if (porSlug && porSlug.code === route.destination_code) return porSlug
  }
  const todos = await listLandingDestinations(db)
  return todos.find(d => d.code === route.destination_code) ?? null
}
