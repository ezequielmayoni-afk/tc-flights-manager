import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_ORIGIN, publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { getRecentProbesForRoutes, listLandingDestinations, listRoutes } from '@/lib/vuelos-baratos/queries'

/** Lee Supabase en cada request: no se puede prerenderizar en el build. */
export const dynamic = 'force-dynamic'

/**
 * Sitemap de vuelos.siviajo.com.
 *
 * El `lastModified` de cada destino es la última observación de su ruta
 * principal: si el barrido dejó de correr, Google ve que la página no cambió
 * en vez de que le mintamos con la fecha de hoy.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicBaseUrl()
  const ahora = new Date()

  const db = createAdminClient()
  const [destinations, routes] = await Promise.all([
    listLandingDestinations(db, { activeOnly: true }),
    listRoutes(db, { activeOnly: true }),
  ])

  const principales = routes.filter(route => route.origin_tc_code === DEFAULT_ORIGIN)
  const rowsByRoute = await getRecentProbesForRoutes(
    db,
    principales.map(route => route.id),
    { fromDate: todayIso(ahora) }
  )

  const ultimaPorDestino = new Map<string, Date>()
  for (const route of principales) {
    const ultima = (rowsByRoute.get(route.id) ?? []).reduce<string | null>(
      (max, row) => (max === null || row.probed_at > max ? row.probed_at : max),
      null
    )
    if (ultima) ultimaPorDestino.set(route.destination_code, new Date(ultima))
  }

  return [
    { url: `${base}/vuelos-baratos`, lastModified: ahora, changeFrequency: 'daily', priority: 1 },
    ...destinations.map(destino => ({
      url: `${base}/vuelos-baratos/${destino.slug}`,
      lastModified: ultimaPorDestino.get(destino.code) ?? ahora,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
