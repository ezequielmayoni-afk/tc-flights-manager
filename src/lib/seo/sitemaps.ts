import type { Db } from '@/lib/jobs/types'

/**
 * Sitemaps de siviajo.com servidos por HUB (`/sitemaps/index.xml` y
 * `/sitemaps/{archivo}.xml`) desde `seo_sitemap_entries`. TC no genera
 * sitemaps; Google acepta uno alojado en otro host del mismo dominio
 * verificado (`sc-domain:siviajo.com`).
 */

/** Host donde se publican los sitemaps (hub.siviajo.com; en local, lo que diga la env). */
export function sitemapsBaseUrl(): string {
  return (process.env.SEO_SITEMAPS_BASE_URL || 'https://hub.siviajo.com').replace(/\/+$/, '')
}

export interface SitemapFile {
  file: string
  urls: number
  lastmod: string | null
}

const PAGE = 1000
/** Un archivo de sitemap admite 50.000 URLs; cortamos antes por las dudas. */
export const MAX_URLS_PER_FILE = 45_000

export interface SitemapUrl {
  url: string
  lastmod: string | null
}

export async function listSitemapFiles(db: Db): Promise<SitemapFile[]> {
  const files = new Map<string, SitemapFile>()
  for (let from = 0; from < 200_000; from += PAGE) {
    const { data, error } = await db.from('seo_sitemap_entries').select('file, lastmod').eq('active', true).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`No se pudo leer seo_sitemap_entries: ${error.message}`)
    const rows = (data ?? []) as Array<{ file: string; lastmod: string | null }>
    for (const r of rows) {
      const f = files.get(r.file) ?? { file: r.file, urls: 0, lastmod: null }
      f.urls++
      if (r.lastmod && (!f.lastmod || r.lastmod > f.lastmod)) f.lastmod = r.lastmod
      files.set(r.file, f)
    }
    if (rows.length < PAGE) break
  }
  return [...files.values()].sort((a, b) => a.file.localeCompare(b.file))
}

export async function listSitemapUrls(db: Db, file: string): Promise<SitemapUrl[]> {
  const out: SitemapUrl[] = []
  for (let from = 0; from < MAX_URLS_PER_FILE; from += PAGE) {
    const { data, error } = await db.from('seo_sitemap_entries').select('url, lastmod').eq('file', file).eq('active', true).order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`No se pudo leer el sitemap ${file}: ${error.message}`)
    const rows = (data ?? []) as SitemapUrl[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

export function renderSitemapIndex(files: SitemapFile[], base: string): string {
  const items = files
    .filter(f => f.urls > 0)
    .map(f => `  <sitemap>\n    <loc>${esc(`${base}/sitemaps/${f.file}.xml`)}</loc>${f.lastmod ? `\n    <lastmod>${f.lastmod}</lastmod>` : ''}\n  </sitemap>`)
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</sitemapindex>\n`
}

export function renderUrlset(urls: SitemapUrl[]): string {
  const items = urls.map(u => `  <url>\n    <loc>${esc(u.url)}</loc>${u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : ''}\n  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items}\n</urlset>\n`
}

/** Nombre de archivo válido: letras, números y guiones (sin `.xml`). */
export function isValidSitemapFile(name: string): boolean {
  return /^[a-z0-9-]{1,60}$/.test(name)
}
