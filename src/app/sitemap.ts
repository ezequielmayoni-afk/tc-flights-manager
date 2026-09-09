import type { MetadataRoute } from 'next'
import { createAdminClient } from '@/lib/supabase/admin'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import { DEFAULT_ORIGIN, PUBLIC_CACHE_TTL_MS, publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { getLastProbedAtByRoute, listLandingDestinations, listRoutes } from '@/lib/vuelos-baratos/queries'

/** Lee Supabase en cada request: no se puede prerenderizar en el build. */
export const dynamic = 'force-dynamic'

interface DestinoSitemap {
  slug: string
  /** Última observación de la ruta principal del destino, o null si no hay. */
  ultimaObservacion: string | null
}

/**
 * Lo que el sitemap necesita de la base, cacheado 10 minutos como el resto de
 * la landing: un crawler pidiendo /sitemap.xml en loop no le pega a Supabase
 * en cada request.
 */
async function loadSitemap(): Promise<DestinoSitemap[]> {
  return ttlMemo('sitemap', PUBLIC_CACHE_TTL_MS, async () => {
    const db = createAdminClient()
    const [destinations, routes] = await Promise.all([
      listLandingDestinations(db, { activeOnly: true }),
      listRoutes(db, { activeOnly: true }),
    ])

    const principales = routes.filter(route => route.origin_tc_code === DEFAULT_ORIGIN)
    const ultimaPorRuta = await getLastProbedAtByRoute(
      db,
      principales.map(route => route.id),
      { fromDate: todayIso(new Date()) }
    )

    const ultimaPorDestino = new Map<string, string>()
    for (const route of principales) {
      const ultima = ultimaPorRuta.get(route.id)
      if (ultima) ultimaPorDestino.set(route.destination_code, ultima)
    }

    return destinations.map(destino => ({
      slug: destino.slug,
      ultimaObservacion: ultimaPorDestino.get(destino.code) ?? null,
    }))
  })
}

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
  const destinos = await loadSitemap()

  return [
    { url: `${base}/vuelos-baratos`, lastModified: ahora, changeFrequency: 'daily', priority: 1 },
    ...destinos.map(destino => ({
      url: `${base}/vuelos-baratos/${destino.slug}`,
      lastModified: destino.ultimaObservacion ? new Date(destino.ultimaObservacion) : ahora,
      changeFrequency: 'daily' as const,
      priority: 0.8,
    })),
  ]
}
