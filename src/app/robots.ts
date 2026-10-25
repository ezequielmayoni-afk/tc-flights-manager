import type { MetadataRoute } from 'next'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'

/**
 * El host público sólo tiene la landing: todo lo demás del HUB está detrás del
 * login y no debería ni intentar rastrearse.
 *
 * `/_next/static/` y `/_next/image` van permitidos a propósito: con el
 * `disallow: ['/']` Googlebot no bajaba el CSS ni el JS y renderizaba la
 * página pelada (Core Web Vitals y mobile-friendly en cero).
 *
 * `/$` (la raíz, y sólo la raíz) también va permitida: Google entra al host
 * por `https://vuelos.siviajo.com/` y durante cinco semanas Search Console la
 * reportó "Bloqueada por robots.txt", así que nunca siguió hasta la landing
 * (las URLs del sitemap quedaron "desconocidas para Google"). En el host
 * público la raíz redirige (308) a `/vuelos-baratos`; en hub.siviajo.com
 * redirige al login, que sigue bloqueado por el `disallow`.
 *
 * `/sitemap.xml` también: es el sitemap que se declara acá abajo y Search
 * Console lo daba con error porque el `disallow` no le dejaba bajarlo. Y los
 * íconos (`/favicon.ico`, `/icon.png`, `/apple-icon.png`): sin poder bajarlos,
 * Google muestra el globo genérico en lugar del isologo en los resultados.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/$',
          '/vuelos-baratos',
          '/vuelos-baratos/',
          '/sitemap.xml',
          '/sitemaps/',
          '/_next/static/',
          '/_next/image',
          '/favicon.ico',
          '/icon.png',
          '/apple-icon.png',
        ],
        disallow: ['/'],
      },
    ],
    sitemap: `${publicBaseUrl()}/sitemap.xml`,
  }
}
