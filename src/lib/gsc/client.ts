import { google } from 'googleapis'
import { getBudgetStatus, recordExternalCall } from '@/lib/jobs/budget'
import type { Db } from '@/lib/jobs/types'
import { GscBudgetExhausted, type GscApi, type GscClient, type PageStatRow } from './types'

/**
 * Cliente de Google Search Console para vuelos.siviajo.com.
 *
 * Autentica con la MISMA service account que Drive (`GOOGLE_DRIVE_CREDENTIALS`,
 * hub-siviajo@hub-siviajo.iam.gserviceaccount.com) pero **sin `subject`**: la
 * SA tiene permiso propio (`siteFullUser`) sobre la propiedad de dominio
 * `sc-domain:siviajo.com`, y la delegación a emayoni@ no está habilitada para
 * el scope `webmasters` (impersonar da `unauthorized_client`).
 *
 * Verificado en vivo el 2026-09-10 contra la propiedad real:
 * - `webmasters('v3').sitemaps.submit/get` funciona (el sitemap quedó
 *   `isPending: true` a los pocos minutos de enviarlo).
 * - `webmasters('v3').searchanalytics.query` responde vacío mientras el
 *   subdominio no tenga historia; no es un error.
 * - La inspección de URLs vive en OTRA API: `searchconsole('v1')`,
 *   `urlInspection.index.inspect`. En `webmasters('v3')` no existe.
 *
 * Cada llamada consume una unidad del presupuesto `gsc` (100/día) y queda en
 * `external_calls`, incluso si falla: la cuota de Google se gasta igual.
 */

export const GSC_PROVIDER = 'gsc'

/** Propiedad de dominio: cubre www.siviajo.com y vuelos.siviajo.com. */
const DEFAULT_SITE_URL = 'sc-domain:siviajo.com'
const SCOPES = ['https://www.googleapis.com/auth/webmasters']
/** La inspección devuelve los textos de cobertura en este idioma. */
const INSPECTION_LANGUAGE = 'es'

export { GscBudgetExhausted } from './types'
export type { GscApi, GscClient, PageStatRow, PageStatsQuery, SitemapStatus, UrlStatus } from './types'

/** Sin credenciales no hay Search Console: los jobs terminan `skipped`. */
export function isGscConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_CREDENTIALS
}

export function gscSiteUrl(): string {
  return (process.env.GSC_SITE_URL || '').trim() || DEFAULT_SITE_URL
}

function auth() {
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS
  if (!raw) throw new Error('GOOGLE_DRIVE_CREDENTIALS no está configurada')

  let credentials: { client_email?: string; private_key?: string }
  try {
    credentials = JSON.parse(raw) as { client_email?: string; private_key?: string }
  } catch {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS no es un JSON válido')
  }
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error('GOOGLE_DRIVE_CREDENTIALS no tiene client_email/private_key')
  }

  // Sin `subject`: la SA entra con su propio permiso sobre la propiedad.
  return new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: SCOPES,
  })
}

/** `errors`/`warnings`/`submitted` vienen como string (int64 en JSON). */
function numero(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function esNoEncontrado(err: unknown): boolean {
  const e = err as { status?: unknown; code?: unknown; response?: { status?: unknown } }
  return e?.status === 404 || e?.code === 404 || e?.response?.status === 404
}

/** Implementación real contra Google. Los tests inyectan otra. */
export function createGscApi(): GscApi {
  const jwt = auth()
  const webmasters = google.webmasters({ version: 'v3', auth: jwt })
  const searchconsole = google.searchconsole({ version: 'v1', auth: jwt })

  return {
    async submitSitemap(site, feedpath) {
      await webmasters.sitemaps.submit({ siteUrl: site, feedpath })
    },

    async getSitemap(site, feedpath) {
      try {
        const { data } = await webmasters.sitemaps.get({ siteUrl: site, feedpath })
        // `contents[]` trae una entrada por tipo (web, image, video): el total
        // de URLs del sitemap es la suma, no la primera.
        const contents = data.contents ?? []
        const leido = contents.length > 0
        return {
          lastSubmitted: data.lastSubmitted ?? null,
          lastDownloaded: data.lastDownloaded ?? null,
          isPending: data.isPending === true,
          errors: numero(data.errors),
          warnings: numero(data.warnings),
          submitted: leido ? contents.reduce((acc, c) => acc + numero(c.submitted), 0) : null,
          indexed: leido ? contents.reduce((acc, c) => acc + numero(c.indexed), 0) : null,
        }
      } catch (err) {
        // 404 = Google todavía no registró el sitemap (o se envió recién): no
        // es un error del job, es "no hay estado que guardar".
        if (esNoEncontrado(err)) return null
        throw err
      }
    },

    async queryPages(site, q) {
      const { data } = await webmasters.searchanalytics.query({
        siteUrl: site,
        requestBody: {
          startDate: q.startDate,
          endDate: q.endDate,
          dimensions: ['date', 'page'],
          // La propiedad es de dominio (cubre siviajo.com entero): sin este
          // filtro volverían también las páginas del motor de reservas.
          dimensionFilterGroups: [{ filters: [{ dimension: 'page', operator: 'contains', expression: q.pagePrefix }] }],
          rowLimit: q.rowLimit ?? 1000,
        },
      })

      const rows: PageStatRow[] = []
      for (const row of data.rows ?? []) {
        const [date, page] = row.keys ?? []
        if (!date || !page) continue
        rows.push({
          date,
          page,
          clicks: numero(row.clicks),
          impressions: numero(row.impressions),
          ctr: numero(row.ctr),
          position: numero(row.position),
        })
      }
      return rows
    },

    async inspectUrl(site, url) {
      const { data } = await searchconsole.urlInspection.index.inspect({
        requestBody: { inspectionUrl: url, siteUrl: site, languageCode: INSPECTION_LANGUAGE },
      })
      const result = data.inspectionResult?.indexStatusResult ?? null
      return {
        url,
        verdict: result?.verdict ?? null,
        coverageState: result?.coverageState ?? null,
        indexingState: result?.indexingState ?? null,
        lastCrawlTime: result?.lastCrawlTime ?? null,
        googleCanonical: result?.googleCanonical ?? null,
        robotsTxtState: result?.robotsTxtState ?? null,
        raw: data.inspectionResult ?? null,
      }
    },
  }
}

export interface GscClientOptions {
  /** Job que hace las llamadas; queda en external_calls.job_id. */
  jobId?: number | null
  /** API a usar; por defecto la real. Los tests inyectan un doble. */
  api?: GscApi
  /** Si es false no consulta provider_budgets antes de cada llamada. */
  enforceBudget?: boolean
}

/**
 * El cliente ligado a la propiedad, al job y al presupuesto.
 *
 * El presupuesto se mira ANTES de cada llamada (no una vez al empezar): una
 * tanda de 20 inspecciones puede cruzar el tope a mitad de camino, y cuando lo
 * cruza lanza `GscBudgetExhausted`, que la orquestación toma como "seguimos
 * mañana" y no como error.
 */
export function createGscClient(db: Db, options: GscClientOptions = {}): GscClient {
  const { jobId = null, enforceBudget = true } = options
  const site = gscSiteUrl()
  // Perezoso: un job que termina `skipped` antes de llamar a Google no debe
  // fallar por credenciales mal escritas.
  let api: GscApi | null = options.api ?? null
  let callsMade = 0

  function apiReal(): GscApi {
    if (!api) api = createGscApi()
    return api
  }

  async function llamar<T>(op: string, fn: (api: GscApi) => Promise<T>): Promise<T> {
    if (enforceBudget) {
      const budget = await getBudgetStatus(db, GSC_PROVIDER)
      if (budget.exhausted) throw new GscBudgetExhausted(budget.pct)
    }

    const started = Date.now()
    let status: 'ok' | 'error' | 'timeout' = 'ok'
    callsMade++
    try {
      return await fn(apiReal())
    } catch (err) {
      status = err instanceof Error && err.name === 'TimeoutError' ? 'timeout' : 'error'
      throw err
    } finally {
      await recordExternalCall(db, {
        provider: GSC_PROVIDER,
        endpoint: `vuelos-baratos:${op}`,
        units: 1,
        status,
        durationMs: Date.now() - started,
        jobId,
      })
    }
  }

  return {
    submitSitemap(feedpath) {
      return llamar('sitemap_submit', api => api.submitSitemap(site, feedpath))
    },
    getSitemap(feedpath) {
      return llamar('sitemap_get', api => api.getSitemap(site, feedpath))
    },
    queryPages(q) {
      return llamar('searchanalytics', api => api.queryPages(site, q))
    },
    inspectUrl(url) {
      return llamar('url_inspection', api => api.inspectUrl(site, url))
    },
    get callsMade() {
      return callsMade
    },
  }
}
