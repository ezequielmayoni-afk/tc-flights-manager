import { describe, expect, it, vi } from 'vitest'
import { GscBudgetExhausted, type AnalyticsQuery, type AnalyticsRow, type GscClient, type SitemapListEntry, type UrlStatus } from '@/lib/gsc/types'
import { INSPECT_PER_RUN, PERFORMANCE_BACKFILL_DAYS, PERFORMANCE_INCREMENTAL_DAYS, ROWS_PER_CALL, runSiteGscSync, type SiteSyncDeps } from '../site-sync'

const HOY = new Date(Date.UTC(2026, 9, 17, 21, 0)) // 17 de octubre de 2026

function fila(keys: string[], over: Partial<AnalyticsRow> = {}): AnalyticsRow {
  return { keys, clicks: 1, impressions: 10, ctr: 0.1, position: 5, ...over }
}

function estado(url: string, verdict = 'PASS'): UrlStatus {
  return { url, verdict, coverageState: null, indexingState: null, lastCrawlTime: null, googleCanonical: url, robotsTxtState: null, raw: null }
}

interface Opts {
  queryRows?: (q: AnalyticsQuery) => Promise<AnalyticsRow[]>
  listSitemaps?: () => Promise<SitemapListEntry[]>
  inspectUrl?: (url: string) => Promise<UrlStatus>
}

function cliente(opts: Opts = {}): GscClient & { calls: Array<{ op: string; q?: AnalyticsQuery }> } {
  const calls: Array<{ op: string; q?: AnalyticsQuery }> = []
  return {
    calls,
    async submitSitemap() {
      calls.push({ op: 'submit' })
    },
    async getSitemap() {
      calls.push({ op: 'get' })
      return null
    },
    async queryPages() {
      calls.push({ op: 'pages' })
      return []
    },
    async queryRows(q) {
      calls.push({ op: 'rows', q })
      if (opts.queryRows) return opts.queryRows(q)
      return q.dimensions[1] === 'page'
        ? [fila(['2026-10-15', 'https://www.siviajo.com/']), fila(['2026-10-15', 'https://www.siviajo.com/es/idea/1/x'])]
        : [fila(['2026-10-15', 'si viajo'], { clicks: 50 }), fila(['2026-10-15', 'paquetes a bayahibe'])]
    },
    async listSitemaps() {
      calls.push({ op: 'sitemaps' })
      if (opts.listSitemaps) return opts.listSitemaps()
      return [{ feedpath: 'https://www.siviajo.com/sitemap.xml', isSitemapsIndex: false, lastSubmitted: null, lastDownloaded: null, isPending: false, errors: 0, warnings: 6, submitted: 109, indexed: 0 }]
    },
    async inspectUrl(url) {
      calls.push({ op: 'inspect' })
      if (opts.inspectUrl) return opts.inspectUrl(url)
      return estado(url)
    },
    get callsMade() {
      return calls.length
    },
  }
}

function deps(gsc: GscClient, over: Partial<SiteSyncDeps> = {}) {
  const guardado = { pages: [] as unknown[], queries: [] as Array<{ query: string; isBrand: boolean }>, sitemaps: [] as unknown[], urls: [] as UrlStatus[] }
  const d: SiteSyncDeps = {
    gsc,
    hasQueryStats: async () => false,
    savePageStats: async rows => {
      guardado.pages.push(...rows)
    },
    saveQueryStats: async rows => {
      guardado.queries.push(...rows)
    },
    saveSitemaps: async rows => {
      guardado.sitemaps.push(...rows)
    },
    urlsToInspect: async () => ['https://www.siviajo.com/', 'https://www.siviajo.com/es/idea/1/x'],
    saveUrlStatus: async row => {
      guardado.urls.push(row)
    },
    heartbeat: vi.fn(async () => {}),
    log: vi.fn(async () => {}),
    now: () => HOY,
    ...over,
  }
  return { d, guardado }
}

describe('runSiteGscSync', () => {
  it('primera corrida: backfill de 28 días, marca las consultas de marca, guarda sitemaps e inspecciona', async () => {
    const gsc = cliente()
    const { d, guardado } = deps(gsc)
    const s = await runSiteGscSync(d)

    expect(s.window).toEqual({ start: '2026-09-18', end: '2026-10-15', backfill: true })
    const q = gsc.calls.find(c => c.op === 'rows')!.q!
    expect(q.startDate).toBe('2026-09-18')
    expect(q.endDate).toBe('2026-10-15')
    expect(q.rowLimit).toBe(ROWS_PER_CALL)

    expect(s.pageRows).toBe(2)
    expect(s.queryRows).toBe(2)
    expect(guardado.queries.map(x => x.isBrand)).toEqual([true, false])
    expect(s.sitemaps).toBe(1)
    expect(s.inspected).toBe(2)
    expect(s.indexed).toBe(2)
    expect(s.errors).toBe(0)
    expect(s.budgetStopped).toBe(false)
    // backfill cubre exactamente 28 días
    expect(PERFORMANCE_BACKFILL_DAYS).toBe(28)
  })

  it('con historia pide sólo la cola de 4 días', async () => {
    const gsc = cliente()
    const { d } = deps(gsc, { hasQueryStats: async () => true })
    const s = await runSiteGscSync(d)
    expect(s.window).toEqual({ start: '2026-10-12', end: '2026-10-15', backfill: false })
    expect(PERFORMANCE_INCREMENTAL_DAYS).toBe(4)
  })

  it('pagina mientras la API devuelve páginas llenas', async () => {
    let llamadas = 0
    const gsc = cliente({
      queryRows: async q => {
        llamadas++
        if (q.dimensions[1] !== 'page') return []
        // primera página llena, segunda a medias
        return (q.startRow ?? 0) === 0 ? Array.from({ length: ROWS_PER_CALL }, (_, i) => fila(['2026-10-15', `https://www.siviajo.com/p/${i}`])) : [fila(['2026-10-15', 'https://www.siviajo.com/ultima'])]
      },
    })
    const { d } = deps(gsc)
    const s = await runSiteGscSync(d)
    expect(s.pageRows).toBe(ROWS_PER_CALL + 1)
    expect(llamadas).toBe(3) // 2 de páginas + 1 de consultas
  })

  it('si la cuota se agota a mitad de las inspecciones, corta y lo dice sin fallar', async () => {
    let n = 0
    const gsc = cliente({
      inspectUrl: async url => {
        n++
        if (n === 2) throw new GscBudgetExhausted(100)
        return estado(url)
      },
    })
    const { d } = deps(gsc)
    const s = await runSiteGscSync(d)
    expect(s.inspected).toBe(1)
    expect(s.budgetStopped).toBe(true)
    expect(s.errors).toBe(0)
  })

  it('un error en una inspección se cuenta y se sigue; un error al traer consultas se loguea', async () => {
    const gsc = cliente({
      inspectUrl: async url => {
        if (url.endsWith('/')) throw new Error('500')
        return estado(url, 'NEUTRAL')
      },
      queryRows: async q => {
        if (q.dimensions[1] === 'query') throw new Error('boom')
        return [fila(['2026-10-15', 'https://www.siviajo.com/'])]
      },
    })
    const { d } = deps(gsc)
    const s = await runSiteGscSync(d)
    expect(s.errors).toBe(2)
    expect(s.inspected).toBe(1)
    expect(s.indexed).toBe(0)
    expect(s.queryRows).toBe(0)
    expect(d.log).toHaveBeenCalled()
  })

  it('no inspecciona más de INSPECT_PER_RUN aunque le den más URLs', async () => {
    const gsc = cliente()
    const { d } = deps(gsc, { urlsToInspect: async () => Array.from({ length: 60 }, (_, i) => `https://www.siviajo.com/u/${i}`) })
    const s = await runSiteGscSync(d)
    expect(s.inspected).toBe(INSPECT_PER_RUN)
  })
})
