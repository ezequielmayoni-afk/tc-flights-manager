import { describe, expect, it, vi } from 'vitest'
import { GscBudgetExhausted, type GscClient, type PageStatRow, type PageStatsQuery, type SitemapStatus, type UrlStatus } from '../types'
import {
  INSPECT_PER_RUN,
  PERFORMANCE_BACKFILL_DAYS,
  PERFORMANCE_INCREMENTAL_DAYS,
  PERFORMANCE_LAG_DAYS,
  runVuelosGscSync,
  type GscSyncDeps,
} from '../vuelos-sync'

/**
 * La sincronización diaria con Search Console: qué llama, en qué orden y qué
 * hace cuando algo falla. Todo con dobles — acá no hay red ni base (la cuota
 * de la propiedad son 100 llamadas por día).
 */

const HOY = new Date(Date.UTC(2026, 8, 10, 21, 30)) // 10 de septiembre de 2026, 21:30 UTC

function sitemap(over: Partial<SitemapStatus> = {}): SitemapStatus {
  return {
    lastSubmitted: '2026-09-10T20:09:00Z',
    lastDownloaded: null,
    isPending: true,
    errors: 0,
    warnings: 0,
    submitted: 6,
    indexed: 0,
    ...over,
  }
}

function estado(url: string, over: Partial<UrlStatus> = {}): UrlStatus {
  return {
    url,
    verdict: 'PASS',
    coverageState: 'Submitted and indexed',
    indexingState: 'INDEXING_ALLOWED',
    lastCrawlTime: '2026-09-09T04:12:00Z',
    googleCanonical: url,
    robotsTxtState: 'ALLOWED',
    raw: { inspectionResult: {} },
    ...over,
  }
}

function fila(page: string, over: Partial<PageStatRow> = {}): PageStatRow {
  return { date: '2026-09-08', page, clicks: 3, impressions: 100, ctr: 0.03, position: 12.5, ...over }
}

interface FakeOpts {
  submitSitemap?: () => Promise<void>
  getSitemap?: () => Promise<SitemapStatus | null>
  queryPages?: (q: PageStatsQuery) => Promise<PageStatRow[]>
  inspectUrl?: (url: string) => Promise<UrlStatus>
}

function fakeGsc(opts: FakeOpts = {}) {
  const calls: string[] = []
  const queries: PageStatsQuery[] = []
  const inspected: string[] = []
  let callsMade = 0

  const gsc: GscClient = {
    async submitSitemap(feedpath) {
      calls.push(`submit:${feedpath}`)
      callsMade++
      if (opts.submitSitemap) return opts.submitSitemap()
    },
    async getSitemap(feedpath) {
      calls.push(`get:${feedpath}`)
      callsMade++
      return opts.getSitemap ? opts.getSitemap() : sitemap()
    },
    async queryPages(q) {
      calls.push('query')
      queries.push(q)
      callsMade++
      return opts.queryPages ? opts.queryPages(q) : [fila('https://vuelos.siviajo.com/vuelos-baratos')]
    },
    async inspectUrl(url) {
      calls.push(`inspect:${url}`)
      inspected.push(url)
      callsMade++
      return opts.inspectUrl ? opts.inspectUrl(url) : estado(url)
    },
    get callsMade() {
      return callsMade
    },
  }

  return { gsc, calls, queries, inspected }
}

function deps(over: Partial<GscSyncDeps> & { gsc: GscClient }): GscSyncDeps {
  return {
    urls: ['https://vuelos.siviajo.com/vuelos-baratos'],
    hasStats: async () => true,
    saveStats: async () => {},
    saveUrlStatus: async () => {},
    saveSitemapStatus: async () => {},
    heartbeat: async () => {},
    log: async () => {},
    now: () => HOY,
    ...over,
  }
}

describe('runVuelosGscSync', () => {
  it('envía el sitemap, guarda su estado, trae las métricas e inspecciona las URLs', async () => {
    const { gsc, calls } = fakeGsc()
    const saveSitemapStatus = vi.fn(async () => {})
    const saveStats = vi.fn(async () => {})
    const saveUrlStatus = vi.fn(async () => {})

    const summary = await runVuelosGscSync(
      deps({
        gsc,
        urls: ['https://vuelos.siviajo.com/vuelos-baratos', 'https://vuelos.siviajo.com/vuelos-baratos/miami'],
        saveSitemapStatus,
        saveStats,
        saveUrlStatus,
      })
    )

    expect(summary.sitemapSubmitted).toBe(true)
    expect(summary.sitemap?.submitted).toBe(6)
    expect(summary.statsRows).toBe(1)
    expect(summary.inspected).toBe(2)
    expect(summary.indexed).toBe(2)
    expect(summary.errors).toBe(0)
    expect(summary.budgetStopped).toBe(false)
    expect(summary.durationMs).toBeGreaterThanOrEqual(0)

    // El envío va primero: recién después tiene sentido leer el estado.
    expect(calls[0]).toBe('submit:https://vuelos.siviajo.com/sitemap.xml')
    expect(calls[1]).toBe('get:https://vuelos.siviajo.com/sitemap.xml')
    expect(calls[2]).toBe('query')

    expect(saveSitemapStatus).toHaveBeenCalledWith(expect.objectContaining({ feedpath: 'https://vuelos.siviajo.com/sitemap.xml', submitted: 6 }))
    expect(saveStats).toHaveBeenCalledTimes(1)
    expect(saveUrlStatus).toHaveBeenCalledTimes(2)
  })

  it('sin filas guardadas pide el backfill de 28 días; con filas, sólo los últimos días', async () => {
    const vacio = fakeGsc()
    await runVuelosGscSync(deps({ gsc: vacio.gsc, hasStats: async () => false }))
    expect(vacio.queries[0]).toMatchObject({
      startDate: '2026-08-13', // 10/09 − 28
      endDate: '2026-09-08', // 10/09 − 2 (Search Console publica con retraso)
      pagePrefix: 'https://vuelos.siviajo.com',
    })
    expect(PERFORMANCE_BACKFILL_DAYS).toBe(28)
    expect(PERFORMANCE_LAG_DAYS).toBe(2)

    const conDatos = fakeGsc()
    await runVuelosGscSync(deps({ gsc: conDatos.gsc, hasStats: async () => true }))
    expect(conDatos.queries[0]).toMatchObject({ startDate: '2026-09-06', endDate: '2026-09-08' })
    expect(PERFORMANCE_INCREMENTAL_DAYS).toBe(4)
  })

  it('inspecciona como mucho INSPECT_PER_RUN URLs por corrida', async () => {
    const urls = Array.from({ length: INSPECT_PER_RUN + 5 }, (_, i) => `https://vuelos.siviajo.com/vuelos-baratos/d${i}`)
    const { gsc, inspected } = fakeGsc()

    const summary = await runVuelosGscSync(deps({ gsc, urls }))

    expect(inspected).toHaveLength(INSPECT_PER_RUN)
    expect(summary.inspected).toBe(INSPECT_PER_RUN)
    expect(inspected[0]).toBe(urls[0])
  })

  it('cuenta como indexadas sólo las que Google da por indexadas', async () => {
    const urls = ['https://vuelos.siviajo.com/a', 'https://vuelos.siviajo.com/b', 'https://vuelos.siviajo.com/c']
    const { gsc } = fakeGsc({
      inspectUrl: async url => {
        if (url.endsWith('/a')) return estado(url, { verdict: 'PASS' })
        if (url.endsWith('/b')) return estado(url, { verdict: 'NEUTRAL', coverageState: 'URL is unknown to Google' })
        return estado(url, { verdict: 'FAIL', coverageState: 'Excluded by ‘noindex’ tag' })
      },
    })

    const summary = await runVuelosGscSync(deps({ gsc, urls }))

    expect(summary.inspected).toBe(3)
    expect(summary.indexed).toBe(1)
    expect(summary.errors).toBe(0)
  })

  it('el presupuesto agotado corta la tanda sin marcarla como error', async () => {
    const urls = ['https://vuelos.siviajo.com/a', 'https://vuelos.siviajo.com/b', 'https://vuelos.siviajo.com/c']
    const { gsc, inspected } = fakeGsc({
      inspectUrl: async url => {
        if (url.endsWith('/c')) return estado(url)
        if (url.endsWith('/b')) throw new GscBudgetExhausted(100)
        return estado(url)
      },
    })

    const summary = await runVuelosGscSync(deps({ gsc, urls }))

    expect(summary.budgetStopped).toBe(true)
    expect(summary.errors).toBe(0)
    expect(summary.inspected).toBe(1)
    // Se corta en la que se quedó sin cuota: la tercera ni se pide.
    expect(inspected).toEqual(['https://vuelos.siviajo.com/a', 'https://vuelos.siviajo.com/b'])
  })

  it('el presupuesto agotado en el sitemap no intenta las métricas ni la inspección', async () => {
    const { gsc, calls } = fakeGsc({
      submitSitemap: async () => {
        throw new GscBudgetExhausted(100)
      },
    })

    const summary = await runVuelosGscSync(deps({ gsc }))

    expect(summary.budgetStopped).toBe(true)
    expect(summary.sitemapSubmitted).toBe(false)
    expect(summary.statsRows).toBe(0)
    expect(summary.inspected).toBe(0)
    expect(summary.errors).toBe(0)
    expect(calls).toEqual(['submit:https://vuelos.siviajo.com/sitemap.xml'])
  })

  it('un error en una inspección se cuenta y sigue con las demás', async () => {
    const urls = ['https://vuelos.siviajo.com/a', 'https://vuelos.siviajo.com/b', 'https://vuelos.siviajo.com/c']
    const { gsc, inspected } = fakeGsc({
      inspectUrl: async url => {
        if (url.endsWith('/b')) throw new Error('500 backend error')
        return estado(url)
      },
    })
    const saveUrlStatus = vi.fn(async () => {})

    const summary = await runVuelosGscSync(deps({ gsc, urls, saveUrlStatus }))

    expect(inspected).toHaveLength(3)
    expect(summary.inspected).toBe(2)
    expect(summary.indexed).toBe(2)
    expect(summary.errors).toBe(1)
    expect(summary.budgetStopped).toBe(false)
    expect(saveUrlStatus).toHaveBeenCalledTimes(2)
  })

  it('un error en el sitemap o en las métricas no frena la inspección', async () => {
    const { gsc } = fakeGsc({
      getSitemap: async () => {
        throw new Error('404 sitemap no encontrado')
      },
      queryPages: async () => {
        throw new Error('503 Service Unavailable')
      },
    })

    const summary = await runVuelosGscSync(deps({ gsc }))

    expect(summary.sitemapSubmitted).toBe(true)
    expect(summary.sitemap).toBeNull()
    expect(summary.statsRows).toBe(0)
    expect(summary.errors).toBe(2)
    expect(summary.inspected).toBe(1)
  })

  it('renueva el lease después de cada llamada', async () => {
    const urls = ['https://vuelos.siviajo.com/a', 'https://vuelos.siviajo.com/b']
    const { gsc } = fakeGsc()
    const heartbeat = vi.fn(async () => {})

    await runVuelosGscSync(deps({ gsc, urls, heartbeat }))

    // submit + get + query + 2 inspecciones
    expect(heartbeat).toHaveBeenCalledTimes(5)
  })

  it('sin URLs para inspeccionar igual manda el sitemap y trae las métricas', async () => {
    const { gsc, inspected } = fakeGsc()

    const summary = await runVuelosGscSync(deps({ gsc, urls: [] }))

    expect(inspected).toEqual([])
    expect(summary.sitemapSubmitted).toBe(true)
    expect(summary.statsRows).toBe(1)
    expect(summary.inspected).toBe(0)
  })
})
