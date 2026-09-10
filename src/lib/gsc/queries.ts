import type { Db } from '@/lib/jobs/types'
import { aggregatePageStats } from './summary'
import type {
  GscSummary,
  PageStatInsert,
  PageStatRow,
  SitemapStatus,
  SitemapStatusRow,
  UrlStatus,
  UrlStatusRow,
} from './types'

/**
 * Lecturas y escrituras de las tablas `gsc_*`.
 *
 * Mismo criterio que `src/lib/vuelos-baratos/queries.ts`: `createAdminClient()`
 * no tiene los tipos generados de la base, así que acá se piden columnas
 * explícitas y se castean las filas. Un error de Supabase se lanza: tragarlo
 * haría que el job crea que Google no devolvió nada.
 */

const PAGE_STAT_COLUMNS = 'site, date, page, clicks, impressions, ctr, position'
const URL_STATUS_COLUMNS =
  'url, site, verdict, coverage_state, indexing_state, last_crawl_time, google_canonical, robots_txt_state, inspected_at'
const SITEMAP_COLUMNS =
  'feedpath, site, last_submitted, last_downloaded, is_pending, errors, warnings, submitted_urls, indexed_urls, fetched_at'

/** Filas por lote del upsert (un backfill de 28 días trae unas 450). */
const STATS_BATCH = 500
/** Techo de lectura: 28 días × (landing + destinos) entra de sobra. */
const MAX_STAT_ROWS = 5000

/** `ctr` y `position` son NUMERIC: PostgREST los puede devolver como string. */
function toPageStatRow(raw: Record<string, unknown>): PageStatRow {
  return {
    date: String(raw.date),
    page: String(raw.page),
    clicks: Number(raw.clicks ?? 0),
    impressions: Number(raw.impressions ?? 0),
    ctr: Number(raw.ctr ?? 0),
    position: Number(raw.position ?? 0),
  }
}

/**
 * Guarda las filas de rendimiento. Upsert por (site, date, page): el día que
 * Search Console todavía estaba consolidando se pisa con el valor definitivo.
 */
export async function upsertPageStats(db: Db, rows: PageStatInsert[]): Promise<void> {
  for (let i = 0; i < rows.length; i += STATS_BATCH) {
    const lote = rows.slice(i, i + STATS_BATCH)
    const { error } = await db.from('gsc_page_stats').upsert(lote, { onConflict: 'site,date,page' })
    if (error) throw new Error(`No se pudieron guardar las métricas de Search Console: ${error.message}`)
  }
}

/** ¿Ya hay historia de esta propiedad? Decide backfill (28 días) vs. incremental. */
export async function hasPageStats(db: Db, site: string): Promise<boolean> {
  const { data, error } = await db.from('gsc_page_stats').select('date').eq('site', site).limit(1)
  if (error) throw new Error(`No se pudo leer el histórico de Search Console: ${error.message}`)
  return (data ?? []).length > 0
}

/** Estado de indexación de una URL. Upsert por URL: interesa el último, no la serie. */
export async function upsertUrlStatus(db: Db, row: UrlStatus & { site: string }): Promise<void> {
  const { error } = await db.from('gsc_url_status').upsert(
    {
      url: row.url,
      site: row.site,
      verdict: row.verdict,
      coverage_state: row.coverageState,
      indexing_state: row.indexingState,
      last_crawl_time: row.lastCrawlTime,
      google_canonical: row.googleCanonical,
      robots_txt_state: row.robotsTxtState,
      raw: row.raw ?? null,
      inspected_at: new Date().toISOString(),
    },
    { onConflict: 'url' }
  )
  if (error) throw new Error(`No se pudo guardar la inspección de ${row.url}: ${error.message}`)
}

/** Estado del sitemap. Upsert por feedpath, misma idea. */
export async function upsertSitemapStatus(db: Db, row: SitemapStatus & { site: string; feedpath: string }): Promise<void> {
  const { error } = await db.from('gsc_sitemap_status').upsert(
    {
      feedpath: row.feedpath,
      site: row.site,
      last_submitted: row.lastSubmitted,
      last_downloaded: row.lastDownloaded,
      is_pending: row.isPending,
      errors: row.errors,
      warnings: row.warnings,
      submitted_urls: row.submitted,
      indexed_urls: row.indexed,
      fetched_at: new Date().toISOString(),
    },
    { onConflict: 'feedpath' }
  )
  if (error) throw new Error(`No se pudo guardar el estado del sitemap: ${error.message}`)
}

export interface GscSummaryOptions {
  /** Propiedad de Search Console (`sc-domain:siviajo.com`). */
  site: string
  /** Sólo las páginas que empiezan así (la landing dentro de la propiedad). */
  pagePrefix: string
  days?: number
}

function desde(days: number): string {
  const d = new Date(Date.now() - days * 24 * 60 * 60_000)
  return d.toISOString().slice(0, 10)
}

/**
 * Lo que muestra la card de Search Console del admin: totales de la ventana,
 * el detalle por URL y el estado del sitemap.
 *
 * La agregación se hace en TS (`aggregatePageStats`) sobre las filas crudas:
 * son ~450 por mes y así la posición ponderada y el CTR salen de la misma
 * función que testeamos, no de un SQL aparte.
 */
export async function getGscSummary(db: Db, options: GscSummaryOptions): Promise<GscSummary> {
  const { site, pagePrefix, days = 28 } = options

  const [stats, urls, sitemaps] = await Promise.all([
    db
      .from('gsc_page_stats')
      .select(PAGE_STAT_COLUMNS)
      .eq('site', site)
      .gte('date', desde(days))
      .like('page', `${pagePrefix}%`)
      .order('date', { ascending: false })
      .limit(MAX_STAT_ROWS),
    db
      .from('gsc_url_status')
      .select(URL_STATUS_COLUMNS)
      .eq('site', site)
      .like('url', `${pagePrefix}%`)
      .order('url', { ascending: true }),
    db
      .from('gsc_sitemap_status')
      .select(SITEMAP_COLUMNS)
      .eq('site', site)
      .like('feedpath', `${pagePrefix}%`)
      .order('fetched_at', { ascending: false })
      .limit(1),
  ])

  if (stats.error) throw new Error(`No se pudieron leer las métricas de Search Console: ${stats.error.message}`)
  if (urls.error) throw new Error(`No se pudo leer el estado de indexación: ${urls.error.message}`)
  if (sitemaps.error) throw new Error(`No se pudo leer el estado del sitemap: ${sitemaps.error.message}`)

  const rows = ((stats.data ?? []) as unknown as Array<Record<string, unknown>>).map(toPageStatRow)
  const sitemapRows = (sitemaps.data ?? []) as unknown as SitemapStatusRow[]

  return {
    ...aggregatePageStats(rows),
    urlStatus: (urls.data ?? []) as unknown as UrlStatusRow[],
    sitemap: sitemapRows[0] ?? null,
  }
}
