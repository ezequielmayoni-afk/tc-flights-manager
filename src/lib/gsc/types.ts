/**
 * Tipos del cliente de Search Console y de las tablas `gsc_*`.
 *
 * Viven acá (y no en `client.ts`) para que la orquestación y sus tests no
 * tengan que importar `googleapis`: `vuelos-sync.ts` sólo habla con la
 * interfaz `GscClient` y con `GscBudgetExhausted`, que son las dos cosas de
 * este archivo que se usan en runtime.
 */

/** Estado de un sitemap enviado (`sitemaps.get`). */
export interface SitemapStatus {
  lastSubmitted: string | null
  lastDownloaded: string | null
  /** Google lo recibió pero todavía no lo procesó. */
  isPending: boolean
  errors: number
  warnings: number
  /** URLs declaradas en el sitemap (suma de `contents[]`); null si Google aún no lo leyó. */
  submitted: number | null
  /** URLs de esas que Google tiene indexadas; null si aún no lo leyó. */
  indexed: number | null
}

/** Una fila de `searchanalytics.query` con dimensiones `['date','page']`. */
export interface PageStatRow {
  date: string
  page: string
  clicks: number
  impressions: number
  /** 0–1 (como lo devuelve la API), no porcentaje. */
  ctr: number
  /** Posición media; 1 es el primer resultado. */
  position: number
}

export interface PageStatsQuery {
  /** YYYY-MM-DD, inclusive. */
  startDate: string
  /** YYYY-MM-DD, inclusive. */
  endDate: string
  /** Filtro `page contains <prefijo>`: la propiedad es de dominio y cubre siviajo.com entero. */
  pagePrefix: string
  rowLimit?: number
}

/** Resultado de `urlInspection.index.inspect` (el `indexStatusResult`). */
export interface UrlStatus {
  url: string
  /** PASS, PARTIAL, FAIL, NEUTRAL o VERDICT_UNSPECIFIED. */
  verdict: string | null
  coverageState: string | null
  indexingState: string | null
  lastCrawlTime: string | null
  googleCanonical: string | null
  robotsTxtState: string | null
  /** La respuesta cruda, para poder mirar campos que todavía no se modelan. */
  raw: unknown
}

/**
 * La API de Google, con el `site` explícito. Es lo que se reemplaza por un
 * doble en los tests del cliente; la orquestación usa `GscClient`.
 */
export interface GscApi {
  submitSitemap(site: string, feedpath: string): Promise<void>
  getSitemap(site: string, feedpath: string): Promise<SitemapStatus | null>
  queryPages(site: string, q: PageStatsQuery): Promise<PageStatRow[]>
  inspectUrl(site: string, url: string): Promise<UrlStatus>
}

/**
 * El mismo contrato ligado a una propiedad, a un job y al presupuesto: cada
 * llamada cuenta una unidad de `gsc` y queda en `external_calls`.
 */
export interface GscClient {
  submitSitemap(feedpath: string): Promise<void>
  getSitemap(feedpath: string): Promise<SitemapStatus | null>
  queryPages(q: PageStatsQuery): Promise<PageStatRow[]>
  inspectUrl(url: string): Promise<UrlStatus>
  /** Llamadas hechas por esta instancia (para el resumen del job). */
  readonly callsMade: number
}

/**
 * Presupuesto de `gsc` agotado (100 llamadas/día).
 *
 * Corta la tanda entera: los jobs que la reciben terminan `skipped`, no
 * `failed`, y mañana se vuelve a encolar lo que faltaba.
 */
export class GscBudgetExhausted extends Error {
  constructor(pct: number) {
    super(`Presupuesto de Search Console agotado (${pct}%)`)
    this.name = 'GscBudgetExhausted'
  }
}

/** Fila de `gsc_page_stats` (la clave es site + date + page). */
export interface PageStatInsert {
  site: string
  date: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

/** Fila de `gsc_url_status` tal como sale de la base. */
export interface UrlStatusRow {
  url: string
  site: string
  verdict: string | null
  coverage_state: string | null
  indexing_state: string | null
  last_crawl_time: string | null
  google_canonical: string | null
  robots_txt_state: string | null
  inspected_at: string
}

/** Fila de `gsc_sitemap_status` tal como sale de la base. */
export interface SitemapStatusRow {
  feedpath: string
  site: string
  last_submitted: string | null
  last_downloaded: string | null
  is_pending: boolean | null
  errors: number | null
  warnings: number | null
  submitted_urls: number | null
  indexed_urls: number | null
  fetched_at: string
}

/** Totales de una página en la ventana consultada. */
export interface PageTotals {
  page: string
  clicks: number
  impressions: number
  /** Ponderada por impresiones. */
  position: number
}

/** Agregado de `gsc_page_stats` para la card del admin. */
export interface GscTotals {
  clicks: number
  impressions: number
  /** clicks / impressions (0 si no hubo impresiones). */
  ctr: number
  /** Posición media ponderada por impresiones (0 si no hubo impresiones). */
  position: number
  pages: PageTotals[]
}

export interface GscSummary extends GscTotals {
  urlStatus: UrlStatusRow[]
  sitemap: SitemapStatusRow | null
}
