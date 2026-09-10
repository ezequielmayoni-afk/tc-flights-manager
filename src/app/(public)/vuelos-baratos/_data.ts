import { createAdminClient } from '@/lib/supabase/admin'
import { bestPerPair, summarizeDestinations } from '@/lib/vuelos-baratos/aggregates'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import {
  DEFAULT_ORIGIN,
  OBSERVATION_WINDOW_HOURS,
  ORIGINS,
  PUBLIC_CACHE_TTL_MS,
  type Origin,
  originByCode,
} from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { minEstimateByMonth } from '@/lib/vuelos-baratos/estimate'
import {
  getEstimatesForRoute,
  getRecentProbes,
  getRecentProbesForRoutes,
  getRouteByCodes,
  listLandingDestinations,
  listRoutes,
} from '@/lib/vuelos-baratos/queries'
import type { BestPair, DestinationSummary, LandingDestinationRow, LandingRouteRow, MonthSummary } from '@/lib/vuelos-baratos/types'

/**
 * Las lecturas que comparten la home, la página de destino y sus OG images.
 *
 * Todo pasa por `ttlMemo` (10 min por clave): la OG image de un destino es un
 * request aparte del HTML, y sin este módulo cada uno haría su propia consulta
 * a Supabase para pintar el mismo precio.
 */

export const ORIGEN_POR_DEFECTO: Origin = originByCode(DEFAULT_ORIGIN) ?? ORIGINS[0]
export const MESES_A_MOSTRAR = 12

export type SearchParams = Record<string, string | string[] | undefined>

export interface DestinoData {
  destination: LandingDestinationRow
  route: LandingRouteRow | null
  pairs: BestPair[]
  /** Mínimo estimado por Sabre de cada mes: sólo para los chips sin sonda. */
  estimatedByMonth: Map<string, number>
}

export type MesConPrecio = MonthSummary & { minPrice: number }

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined
}

/** Un `?from=` desconocido no rompe nada: cae en el origen por defecto. */
export function origenDe(sp: SearchParams): Origin {
  return originByCode(first(sp.from)) ?? ORIGEN_POR_DEFECTO
}

export async function loadHome(originCode: string): Promise<DestinationSummary[]> {
  return ttlMemo(`landing:${originCode}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const [destinations, routes] = await Promise.all([
      listLandingDestinations(db, { activeOnly: true }),
      listRoutes(db, { activeOnly: true }),
    ])
    const delOrigen = routes.filter(route => route.origin_tc_code === originCode)
    const fromDate = todayIso(new Date())
    const rowsByRoute = await getRecentProbesForRoutes(
      db,
      delOrigen.map(route => route.id),
      { fromDate }
    )
    return summarizeDestinations({ rowsByRoute, routes: delOrigen, destinations, fromDate })
  })
}

/**
 * Los destinos publicados, indexados por slug, bajo UNA sola clave de memo.
 *
 * Resolver el slug acá (y no con una consulta por slug) evita cachear un
 * `null` por cada URL inventada: un crawler hostil pega siempre a esta entrada.
 * Despublicar un destino tiene que sacarlo de Google, así que sólo entran los
 * activos.
 */
async function destinosPublicados(): Promise<Map<string, LandingDestinationRow>> {
  return ttlMemo('landing:destinations', PUBLIC_CACHE_TTL_MS, async () => {
    const destinos = await listLandingDestinations(createAdminClient(), { activeOnly: true })
    return new Map(destinos.map(destino => [destino.slug, destino]))
  })
}

export async function loadDestino(slug: string, originCode: string): Promise<DestinoData | null> {
  const destination = (await destinosPublicados()).get(slug)
  // Un slug que no existe no se memoiza: sólo lo publicado ocupa lugar.
  if (!destination) return null

  return ttlMemo(`dest:${slug}:${originCode}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const route = await getRouteByCodes(db, destination.code, originCode)
    if (!route) return { destination, route: null, pairs: [], estimatedByMonth: new Map() }

    const fromDate = todayIso(new Date())
    const rows = await getRecentProbes(db, route.id, { fromDate })
    // Las estimaciones de Sabre valen lo mismo que una observación (48 h) y
    // sólo se usan para los chips de meses todavía sin sonda.
    const estimates = await getEstimatesForRoute(db, route.id, { sinceHours: OBSERVATION_WINDOW_HOURS, fromDate })
    return { destination, route, pairs: bestPerPair(rows, { fromDate }), estimatedByMonth: minEstimateByMonth(estimates) }
  })
}

/** El mínimo del destino desde cada ciudad, para la sección "por ciudad". */
export async function loadPorCiudad(destination: LandingDestinationRow): Promise<DestinationSummary[]> {
  return ttlMemo(`dest-cities:${destination.code}`, PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const routes = await listRoutes(db, { activeOnly: true, destinationCode: destination.code })
    const fromDate = todayIso(new Date())
    const rowsByRoute = await getRecentProbesForRoutes(
      db,
      routes.map(route => route.id),
      { fromDate }
    )
    return summarizeDestinations({ rowsByRoute, routes, destinations: [destination], fromDate })
  })
}

/** Los `cuantos` destinos más baratos con precio, para el título y la OG image. */
export function masBaratos(resumen: DestinationSummary[], cuantos: number): Array<DestinationSummary & { minPrice: number }> {
  return resumen
    .filter((d): d is DestinationSummary & { minPrice: number } => d.minPrice !== null)
    .sort((a, b) => a.minPrice - b.minPrice)
    .slice(0, cuantos)
}

export function mesMasBarato(months: MonthSummary[]): MesConPrecio | null {
  return (
    months
      .filter((m): m is MesConPrecio => m.minPrice !== null)
      .sort((a, b) => a.minPrice - b.minPrice || a.month.localeCompare(b.month))[0] ?? null
  )
}
