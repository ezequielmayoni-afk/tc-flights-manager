import type { MetadataRoute } from 'next'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'

/**
 * El host público sólo tiene la landing: todo lo demás del HUB está detrás del
 * login y no debería ni intentar rastrearse.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: ['/vuelos-baratos', '/vuelos-baratos/'], disallow: ['/'] }],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
  }
}
