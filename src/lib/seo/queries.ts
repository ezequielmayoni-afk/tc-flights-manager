import type { Db } from '@/lib/jobs/types'
import type { SitemapListEntry, UrlStatus } from '@/lib/gsc/types'
import type { GeoEngine } from './config'
import type { GeoProbeInsert, GeoPromptRow } from './geo-probe'
import { pickUrlsToInspect, type QueryStatRow } from './site-sync'
import type { SerpCheckInsert, TrackedKeyword } from './serp-track'
import { sumByPage, sumByQuery, type PageStat, type QueryStat } from './summary'

/**
 * Lecturas y escrituras de las tablas de la Fase 14. Mismo criterio que
 * `gsc/queries.ts`: columnas explícitas, filas casteadas, errores lanzados.
 *
 * PostgREST corta en 1.000 filas por pedido: todo lo que puede superar eso
 * (`gsc_page_stats`, `gsc_query_stats` a 28 días) se lee con `range` en
 * páginas hasta un techo.
 */

const BATCH = 500
const PAGE = 1000
/** 28 días × ~1.500 páginas/día: 40k filas. Más de eso no cambia el tablero. */
const MAX_READ_ROWS = 60_000

function desde(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
}

type PageResult = { data: unknown; error: { message: string } | null }

/** El builder de PostgREST es thenable, no Promise: por eso `PromiseLike`. */
async function leerPaginado<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult>, label: string): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; from < MAX_READ_ROWS; from += PAGE) {
    const { data, error } = await fetchPage(from, from + PAGE - 1)
    if (error) throw new Error(`No se pudo leer ${label}: ${error.message}`)
    const rows = (data ?? []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

// ---------------------------------------------------------------------------
// Search Console (dominio entero)
// ---------------------------------------------------------------------------

export async function hasQueryStats(db: Db, site: string): Promise<boolean> {
  const { data, error } = await db.from('gsc_query_stats').select('id').eq('site', site).limit(1)
  if (error) throw new Error(`No se pudo leer gsc_query_stats: ${error.message}`)
  return (data ?? []).length > 0
}

export async function upsertQueryStats(db: Db, site: string, rows: QueryStatRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += BATCH) {
    const lote = rows.slice(i, i + BATCH).map(r => ({
      site,
      date: r.date,
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      is_brand: r.isBrand,
      fetched_at: new Date().toISOString(),
    }))
    const { error } = await db.from('gsc_query_stats').upsert(lote, { onConflict: 'site,date,query' })
    if (error) throw new Error(`No se pudieron guardar las consultas de Search Console: ${error.message}`)
  }
}

export async function upsertSitemapList(db: Db, site: string, rows: SitemapListEntry[]): Promise<void> {
  if (rows.length === 0) return
  const { error } = await db.from('gsc_sitemap_status').upsert(
    rows.map(r => ({
      feedpath: r.feedpath,
      site,
      last_submitted: r.lastSubmitted,
      last_downloaded: r.lastDownloaded,
      is_pending: r.isPending,
      errors: r.errors,
      warnings: r.warnings,
      submitted_urls: r.submitted,
      indexed_urls: r.indexed,
      fetched_at: new Date().toISOString(),
    })),
    { onConflict: 'feedpath' }
  )
  if (error) throw new Error(`No se pudo guardar el estado de los sitemaps: ${error.message}`)
}

export interface RawPageStat {
  date: string
  page: string
  clicks: number
  impressions: number
  position: number
}

/** Filas (día, página) de la ventana, todo el dominio salvo `excludeHosts`. */
export async function readPageStats(db: Db, site: string, days: number): Promise<RawPageStat[]> {
  const rows = await leerPaginado<Record<string, unknown>>(
    (from, to) => db.from('gsc_page_stats').select('date, page, clicks, impressions, position').eq('site', site).gte('date', desde(days)).order('id', { ascending: true }).range(from, to),
    'gsc_page_stats'
  )
  return rows.map(r => ({ date: String(r.date), page: String(r.page), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), position: Number(r.position ?? 0) }))
}

export interface RawQueryStat {
  date: string
  query: string
  clicks: number
  impressions: number
  position: number
  isBrand: boolean
}

export async function readQueryStats(db: Db, site: string, days: number): Promise<RawQueryStat[]> {
  const rows = await leerPaginado<Record<string, unknown>>(
    (from, to) => db.from('gsc_query_stats').select('date, query, clicks, impressions, position, is_brand').eq('site', site).gte('date', desde(days)).order('id', { ascending: true }).range(from, to),
    'gsc_query_stats'
  )
  return rows.map(r => ({ date: String(r.date), query: String(r.query), clicks: Number(r.clicks ?? 0), impressions: Number(r.impressions ?? 0), position: Number(r.position ?? 0), isBrand: r.is_brand === true }))
}

export interface UrlStatusRow {
  url: string
  verdict: string | null
  coverage_state: string | null
  last_crawl_time: string | null
  google_canonical: string | null
  inspected_at: string
}

export async function readUrlStatuses(db: Db, site: string): Promise<UrlStatusRow[]> {
  const rows = await leerPaginado<UrlStatusRow>(
    (from, to) => db.from('gsc_url_status').select('url, verdict, coverage_state, last_crawl_time, google_canonical, inspected_at').eq('site', site).order('inspected_at', { ascending: false }).range(from, to),
    'gsc_url_status'
  )
  return rows
}

export interface SitemapRow {
  feedpath: string
  last_submitted: string | null
  last_downloaded: string | null
  is_pending: boolean | null
  errors: number | null
  warnings: number | null
  submitted_urls: number | null
  indexed_urls: number | null
  fetched_at: string
}

export async function readSitemaps(db: Db, site: string): Promise<SitemapRow[]> {
  const { data, error } = await db.from('gsc_sitemap_status').select('feedpath, last_submitted, last_downloaded, is_pending, errors, warnings, submitted_urls, indexed_urls, fetched_at').eq('site', site).order('feedpath')
  if (error) throw new Error(`No se pudo leer gsc_sitemap_status: ${error.message}`)
  return (data ?? []) as unknown as SitemapRow[]
}

export interface UrlsToInspectOptions {
  site: string
  limit: number
  /** Una URL inspeccionada hace menos de esto no se vuelve a inspeccionar. */
  staleDays: number
  /** Sólo estas plantillas (hosts) entran en la rotación; por defecto www y blog. */
  hosts?: string[]
}

/**
 * Qué URLs inspeccionar hoy: las de más impresiones (28 días) que nunca se
 * inspeccionaron o cuya inspección tiene más de `staleDays`; la elección
 * (normalización de fragmentos, dedupe, orden) vive en `pickUrlsToInspect`.
 */
export async function urlsToInspect(db: Db, opts: UrlsToInspectOptions): Promise<string[]> {
  const hosts = opts.hosts ?? ['www.siviajo.com', 'siviajo.com', 'blog.siviajo.com']
  const pages = sumByPage(await readPageStats(db, opts.site, 28))
  const estados = new Map((await readUrlStatuses(db, opts.site)).map(u => [u.url, u.inspected_at]))
  return pickUrlsToInspect(pages, estados, { limit: opts.limit, staleDays: opts.staleDays, hosts })
}

export async function upsertUrlStatusRow(db: Db, site: string, row: UrlStatus): Promise<void> {
  const { error } = await db.from('gsc_url_status').upsert(
    {
      url: row.url,
      site,
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

// ---------------------------------------------------------------------------
// SERP (SerpAPI)
// ---------------------------------------------------------------------------

export interface KeywordRow extends TrackedKeyword {
  intent: string
  target_path: string | null
  active: boolean
}

export async function listKeywords(db: Db, options: { activeOnly?: boolean } = {}): Promise<KeywordRow[]> {
  let q = db.from('seo_keywords').select('id, keyword, intent, target_path, active').order('intent').order('keyword')
  if (options.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(`No se pudo leer seo_keywords: ${error.message}`)
  return (data ?? []) as unknown as KeywordRow[]
}

export async function insertSerpCheck(db: Db, row: SerpCheckInsert): Promise<void> {
  const { error } = await db.from('serp_checks').insert({
    keyword_id: row.keywordId,
    keyword: row.keyword,
    week: row.week,
    position: row.position,
    url: row.url,
    ai_overview: row.aiOverview,
    in_ai_overview: row.inAiOverview,
    ai_overview_sources: row.aiOverviewSources,
    local_pack_rank: row.localPackRank,
    local_pack: row.localPack,
    paa: row.paa,
    top: row.top,
    competitors_in_top: row.competitorsInTop,
  })
  if (error) throw new Error(`No se pudo guardar la lectura SERP de "${row.keyword}": ${error.message}`)
}

export interface SerpCheckRow {
  id: number
  keyword_id: number
  keyword: string
  week: string
  checked_at: string
  position: number | null
  url: string | null
  ai_overview: boolean
  in_ai_overview: boolean
  ai_overview_sources: Array<{ source: string | null; link: string | null }>
  local_pack_rank: number | null
  paa: string[]
  competitors_in_top: string[]
}

/** Las últimas N lecturas por consulta (para mostrar la actual y la variación). */
export async function readRecentSerpChecks(db: Db, weeks = 6): Promise<SerpCheckRow[]> {
  const rows = await leerPaginado<SerpCheckRow>(
    (from, to) =>
      db
        .from('serp_checks')
        .select('id, keyword_id, keyword, week, checked_at, position, url, ai_overview, in_ai_overview, ai_overview_sources, local_pack_rank, paa, competitors_in_top')
        .gte('checked_at', new Date(Date.now() - weeks * 7 * 86_400_000).toISOString())
        .order('checked_at', { ascending: false })
        .range(from, to),
    'serp_checks'
  )
  return rows
}

// ---------------------------------------------------------------------------
// GEO (motores de IA)
// ---------------------------------------------------------------------------

export interface PromptRow extends GeoPromptRow {
  category: string
  active: boolean
}

export async function listPrompts(db: Db, options: { activeOnly?: boolean } = {}): Promise<PromptRow[]> {
  let q = db.from('geo_prompts').select('id, prompt, category, active').order('id')
  if (options.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(`No se pudo leer geo_prompts: ${error.message}`)
  return (data ?? []) as unknown as PromptRow[]
}

export async function insertGeoProbe(db: Db, row: GeoProbeInsert): Promise<void> {
  const { error } = await db.from('geo_probes').insert({
    prompt_id: row.promptId,
    engine: row.engine,
    week: row.week,
    model: row.model,
    mentioned: row.mentioned,
    cited: row.cited,
    cited_urls: row.citedUrls,
    citations: row.citations,
    competitors: row.competitors,
    answer: row.answer,
    error: row.error,
  })
  if (error) throw new Error(`No se pudo guardar la sonda ${row.engine}: ${error.message}`)
}

export interface GeoProbeRow {
  id: number
  prompt_id: number
  engine: GeoEngine
  week: string
  asked_at: string
  model: string | null
  mentioned: boolean
  cited: boolean
  cited_urls: string[]
  competitors: string[]
  answer: string | null
  error: string | null
}

export async function readRecentGeoProbes(db: Db, weeks = 8): Promise<GeoProbeRow[]> {
  const rows = await leerPaginado<GeoProbeRow>(
    (from, to) =>
      db
        .from('geo_probes')
        .select('id, prompt_id, engine, week, asked_at, model, mentioned, cited, cited_urls, competitors, answer, error')
        .gte('asked_at', new Date(Date.now() - weeks * 7 * 86_400_000).toISOString())
        .order('asked_at', { ascending: false })
        .range(from, to),
    'geo_probes'
  )
  return rows
}

// ---------------------------------------------------------------------------
// Tablero
// ---------------------------------------------------------------------------

export interface SeoDashboardData {
  pages: PageStat[]
  queries: QueryStat[]
  urlStatus: UrlStatusRow[]
  sitemaps: SitemapRow[]
  serp: SerpCheckRow[]
  keywords: KeywordRow[]
  probes: GeoProbeRow[]
  prompts: PromptRow[]
}

/** Todo lo que muestra /producto/seo, ya sumado por página y por consulta. */
export async function getSeoDashboardData(db: Db, site: string, days: number): Promise<SeoDashboardData> {
  const [pageRows, queryRows, urlStatus, sitemaps, serp, keywords, probes, prompts] = await Promise.all([
    readPageStats(db, site, days),
    readQueryStats(db, site, days),
    readUrlStatuses(db, site),
    readSitemaps(db, site),
    readRecentSerpChecks(db),
    listKeywords(db),
    readRecentGeoProbes(db),
    listPrompts(db),
  ])
  return { pages: sumByPage(pageRows), queries: sumByQuery(queryRows), urlStatus, sitemaps, serp, keywords, probes, prompts }
}
