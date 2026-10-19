import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import { isValidSitemapFile, listSitemapFiles, listSitemapUrls, renderSitemapIndex, renderUrlset, sitemapsBaseUrl } from '@/lib/seo/sitemaps'

export const dynamic = 'force-dynamic'

/** Googlebot pide el índice y cada archivo de a ratos: una hora de caché en memoria alcanza. */
const TTL_MS = 60 * 60_000

/**
 * GET /sitemaps/index.xml → índice con un archivo por grupo (hoteles por
 * destino, paquetes, temáticas). GET /sitemaps/{archivo}.xml → las URLs
 * activas de ese archivo en `seo_sitemap_entries`. Público (está en
 * PUBLIC_PREFIXES del middleware); se envía a Search Console por API.
 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params
  const name = file.replace(/\.xml$/, '')
  if (!file.endsWith('.xml') || !isValidSitemapFile(name)) return new NextResponse('Not found', { status: 404 })

  const db = createAdminClient()
  const base = sitemapsBaseUrl()
  const xml =
    name === 'index'
      ? await ttlMemo('sitemaps:index', TTL_MS, async () => renderSitemapIndex(await listSitemapFiles(db), base))
      : await ttlMemo(`sitemaps:${name}`, TTL_MS, async () => {
          const urls = await listSitemapUrls(db, name)
          return urls.length > 0 ? renderUrlset(urls) : null
        })
  if (!xml) return new NextResponse('Not found', { status: 404 })

  return new NextResponse(xml, {
    status: 200,
    // El archivo vive en hub.siviajo.com sólo como contenedor: las URLs son de www.siviajo.com.
    // `noindex` deja explícito que el XML en sí no debe aparecer en Google.
    headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600', 'X-Robots-Tag': 'noindex' },
  })
}
