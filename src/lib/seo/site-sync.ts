import type { JobContext } from '@/lib/jobs/types'
import { GscBudgetExhausted, type GscClient, type PageStatRow, type SitemapListEntry, type UrlStatus } from '@/lib/gsc/types'
import { addDays, todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { isBrandQuery } from './brand'

/**
 * Sincronización diaria de TODO siviajo.com con Search Console (Fase 14).
 *
 * A diferencia de `gsc/vuelos-sync.ts` (que mira sólo la landing de vuelos),
 * acá se baja el dominio entero: (1) clics e impresiones por página y día,
 * (2) por consulta y día, marcando cuáles son de marca, (3) el estado de
 * todos los sitemaps enviados y (4) una tanda de inspecciones de URL,
 * rotando por las páginas con más impresiones que hace más tiempo no se
 * inspeccionan. Sin red ni base: todo entra por `SiteSyncDeps`.
 *
 * Cuota: 100 llamadas/día en la propiedad, compartida con el sync de vuelos
 * (~23). Esta corrida gasta como mucho ~2·páginas + ~2·consultas + 1 + 25.
 */

/** Search Console publica con ~2 días de retraso. */
export const PERFORMANCE_LAG_DAYS = 2
/** Primera corrida: 28 días (la ventana que muestra el tablero). */
export const PERFORMANCE_BACKFILL_DAYS = 28
/** Después: 4 días (2 nuevos + 2 de margen por revisiones hacia atrás). */
export const PERFORMANCE_INCREMENTAL_DAYS = 4
/** Filas por llamada (máximo de la API: 25.000; 5.000 mantiene la respuesta liviana). */
export const ROWS_PER_CALL = 5000
/** Páginas de 5.000 filas como mucho por consulta: 30.000 filas de (día, página). */
export const MAX_PAGES_PER_QUERY = 6
/** Inspecciones por corrida: 25 deja margen para el sync de vuelos y una corrida manual. */
export const INSPECT_PER_RUN = 25

export interface InspectCandidate {
  page: string
  impressions: number
  clicks: number
}

export interface PickUrlsOptions {
  limit: number
  /** Una URL inspeccionada hace menos de esto no se vuelve a pedir. */
  staleDays: number
  /** Hosts que entran en la rotación. */
  hosts: string[]
  now?: Date
}

/**
 * Elige qué URLs inspeccionar: las de más impresiones que nunca se
 * inspeccionaron o cuya inspección venció. Search Console lista aparte las
 * URLs con `#fragmento` (los enlaces de salto de un post) y las versiones
 * `http://`: se normalizan a la página real y se dedupean, porque la
 * inspección es por página y la cuota son 100 llamadas por día.
 */
export function pickUrlsToInspect(pages: InspectCandidate[], inspectedAt: Map<string, string>, opts: PickUrlsOptions): string[] {
  const limite = (opts.now ?? new Date()).getTime() - opts.staleDays * 86_400_000
  const agregado = new Map<string, { impressions: number; clicks: number }>()
  for (const p of pages) {
    let u: URL
    try {
      u = new URL(p.page)
    } catch {
      continue
    }
    if (u.protocol !== 'https:' || !opts.hosts.includes(u.hostname.toLowerCase())) continue
    u.hash = ''
    const page = u.toString()
    const acc = agregado.get(page) ?? { impressions: 0, clicks: 0 }
    acc.impressions += p.impressions
    acc.clicks += p.clicks
    agregado.set(page, acc)
  }
  return [...agregado.entries()]
    .sort((a, b) => b[1].impressions - a[1].impressions || b[1].clicks - a[1].clicks)
    .map(([page]) => page)
    .filter(page => {
      const at = inspectedAt.get(page)
      return !at || Date.parse(at) < limite
    })
    .slice(0, opts.limit)
}

export interface QueryStatRow {
  date: string
  query: string
  clicks: number
  impressions: number
  ctr: number
  position: number
  isBrand: boolean
}

export interface SiteSyncDeps {
  gsc: GscClient
  /** ¿Ya hay filas de consultas guardadas? Decide backfill vs. incremental. */
  hasQueryStats: () => Promise<boolean>
  savePageStats: (rows: PageStatRow[]) => Promise<void>
  saveQueryStats: (rows: QueryStatRow[]) => Promise<void>
  saveSitemaps: (rows: SitemapListEntry[]) => Promise<void>
  /** URLs a inspeccionar esta corrida, en orden de prioridad (ya recortadas). */
  urlsToInspect: () => Promise<string[]>
  saveUrlStatus: (row: UrlStatus) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
  now?: () => Date
}

export interface SiteSyncSummary {
  window: { start: string; end: string; backfill: boolean }
  pageRows: number
  queryRows: number
  sitemaps: number
  inspected: number
  indexed: number
  errors: number
  budgetStopped: boolean
  durationMs: number
}

type Intento<T> = { ok: true; value: T } | { ok: false; budget: true } | { ok: false; budget: false; error: string }

async function intentar<T>(deps: SiteSyncDeps, fn: () => Promise<T>): Promise<Intento<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    if (err instanceof GscBudgetExhausted) return { ok: false, budget: true }
    return { ok: false, budget: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await deps.heartbeat()
  }
}

/** Trae todas las páginas de una consulta (`startRow` avanza de a ROWS_PER_CALL). */
async function paginar(
  deps: SiteSyncDeps,
  dimensions: Array<'date' | 'page' | 'query'>,
  start: string,
  end: string
): Promise<Intento<Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }>>> {
  const all: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = []
  for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
    const r = await intentar(deps, () =>
      deps.gsc.queryRows({ startDate: start, endDate: end, dimensions, rowLimit: ROWS_PER_CALL, startRow: page * ROWS_PER_CALL })
    )
    if (!r.ok) return all.length > 0 && !r.budget ? { ok: true, value: all } : r
    all.push(...r.value)
    if (r.value.length < ROWS_PER_CALL) break
  }
  return { ok: true, value: all }
}

export async function runSiteGscSync(deps: SiteSyncDeps): Promise<SiteSyncSummary> {
  const ahora = deps.now ?? (() => new Date())
  const started = Date.now()
  const end = addDays(todayIso(ahora()), -PERFORMANCE_LAG_DAYS)
  const backfill = !(await deps.hasQueryStats())
  const start = addDays(end, -((backfill ? PERFORMANCE_BACKFILL_DAYS : PERFORMANCE_INCREMENTAL_DAYS) - 1))

  let pageRows = 0
  let queryRows = 0
  let sitemaps = 0
  let inspected = 0
  let indexed = 0
  let errors = 0
  let budgetStopped = false

  const resumen = (): SiteSyncSummary => ({
    window: { start, end, backfill },
    pageRows,
    queryRows,
    sitemaps,
    inspected,
    indexed,
    errors,
    budgetStopped,
    durationMs: Date.now() - started,
  })

  // 1. Páginas × día
  const paginas = await paginar(deps, ['date', 'page'], start, end)
  if (!paginas.ok) {
    if (paginas.budget) {
      budgetStopped = true
      return resumen()
    }
    errors++
    await deps.log(`Search Console: no se pudieron traer las páginas (${paginas.error})`, undefined, 'warning')
  } else if (paginas.value.length > 0) {
    const rows: PageStatRow[] = paginas.value.map(r => ({ date: r.keys[0], page: r.keys[1], clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position }))
    await deps.savePageStats(rows)
    pageRows = rows.length
  }

  // 2. Consultas × día
  const consultas = await paginar(deps, ['date', 'query'], start, end)
  if (!consultas.ok) {
    if (consultas.budget) {
      budgetStopped = true
      return resumen()
    }
    errors++
    await deps.log(`Search Console: no se pudieron traer las consultas (${consultas.error})`, undefined, 'warning')
  } else if (consultas.value.length > 0) {
    const rows: QueryStatRow[] = consultas.value.map(r => ({
      date: r.keys[0],
      query: r.keys[1],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr,
      position: r.position,
      isBrand: isBrandQuery(r.keys[1]),
    }))
    await deps.saveQueryStats(rows)
    queryRows = rows.length
  }

  // 3. Sitemaps
  const lista = await intentar(deps, () => deps.gsc.listSitemaps())
  if (!lista.ok) {
    if (lista.budget) {
      budgetStopped = true
      return resumen()
    }
    errors++
    await deps.log(`Search Console: no se pudieron listar los sitemaps (${lista.error})`, undefined, 'warning')
  } else {
    await deps.saveSitemaps(lista.value)
    sitemaps = lista.value.length
  }

  // 4. Inspecciones (rotan por impresiones y antigüedad)
  const urls = (await deps.urlsToInspect()).slice(0, INSPECT_PER_RUN)
  for (const url of urls) {
    const r = await intentar(deps, () => deps.gsc.inspectUrl(url))
    if (!r.ok) {
      if (r.budget) {
        budgetStopped = true
        break
      }
      errors++
      continue
    }
    await deps.saveUrlStatus(r.value)
    inspected++
    if (r.value.verdict === 'PASS') indexed++
  }

  return resumen()
}
