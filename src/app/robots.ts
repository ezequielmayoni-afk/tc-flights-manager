import type { MetadataRoute } from 'next'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'

/**
 * El host público sólo tiene la landing: todo lo demás del HUB está detrás del
 * login y no debería ni intentar rastrearse.
 *
 * `/_next/static/` y `/_next/image` van permitidos a propósito: con el
 * `disallow: ['/']` Googlebot no bajaba el CSS ni el JS y renderizaba la
 * página pelada (Core Web Vitals y mobile-friendly en cero).
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/vuelos-baratos', '/vuelos-baratos/', '/_next/static/', '/_next/image'],
        disallow: ['/'],
      },
    ],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
  }
}
