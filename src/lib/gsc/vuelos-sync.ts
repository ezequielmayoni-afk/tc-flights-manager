import type { JobContext } from '@/lib/jobs/types'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { addDays, todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { GscBudgetExhausted, type GscClient, type PageStatRow, type SitemapStatus, type UrlStatus } from './types'

/**
 * La sincronización diaria de vuelos.siviajo.com con Search Console.
 *
 * Tres cosas, en este orden: (1) reenviar el sitemap y guardar cómo lo ve
 * Google, (2) traer clics e impresiones de las páginas de la landing y
 * (3) inspeccionar unas cuantas URLs para saber cuáles están indexadas.
 *
 * Igual que `sweep.ts` y `estimate.ts`, acá no hay red ni base: todo entra por
 * `GscSyncDeps`. La cuota de la propiedad son 100 llamadas por día y el
 * presupuesto `gsc` la hace respetar, así que los tests van con dobles.
 */

/** Sitemap que se le reenvía a Google todos los días (`app/sitemap.ts`). */
export const VUELOS_SITEMAP = (): string => `${publicBaseUrl()}/sitemap.xml`

/**
 * Search Console publica el rendimiento con ~2 días de retraso: pedir hasta
 * ayer trae filas incompletas que después habría que volver a pisar.
 */
export const PERFORMANCE_LAG_DAYS = 2
/** La primera corrida trae el mes entero (es lo que la API guarda para la card de 28 días). */
export const PERFORMANCE_BACKFILL_DAYS = 28
/**
 * Después alcanza con la cola: dos días de datos nuevos más dos de margen, por
 * si Google revisa hacia atrás una fecha que ya habíamos guardado.
 */
export const PERFORMANCE_INCREMENTAL_DAYS = 4
/**
 * URLs inspeccionadas por corrida. Con 100 llamadas/día, 20 dejan de sobra
 * para el sitemap, las métricas y una corrida manual desde el admin.
 */
export const INSPECT_PER_RUN = 20
/** 28 días × (landing + ~15 destinos) ≈ 450 filas; 1000 deja margen. */
export const PERFORMANCE_ROW_LIMIT = 1000

export interface GscSyncDeps {
  gsc: GscClient
  /** Landing + destinos activos, en orden de importancia (se inspeccionan las primeras). */
  urls: string[]
  /** ¿Ya hay filas guardadas de esta propiedad? Decide backfill vs. incremental. */
  hasStats: () => Promise<boolean>
  saveStats: (rows: PageStatRow[]) => Promise<void>
  saveUrlStatus: (row: UrlStatus) => Promise<void>
  saveSitemapStatus: (row: SitemapStatus & { feedpath: string }) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
  now?: () => Date
}

export interface GscSyncSummary {
  sitemapSubmitted: boolean
  sitemap: SitemapStatus | null
  statsRows: number
  inspected: number
  /** De las inspeccionadas, cuántas Google da por indexadas. */
  indexed: number
  errors: number
  /** Se acabó la cuota del día: lo que falte se hace mañana, no es un error. */
  budgetStopped: boolean
  durationMs: number
}

/**
 * Google la tiene indexada.
 *
 * El `verdict` del `indexStatusResult` es PASS sólo cuando la URL está en el
 * índice; un dominio nuevo devuelve NEUTRAL ("URL is unknown to Google") y una
 * excluida, FAIL. No se mira `coverageState`: es texto libre y localizado.
 */
export function isIndexed(status: UrlStatus): boolean {
  return status.verdict === 'PASS'
}

type Intento<T> = { ok: true; value: T } | { ok: false; budget: true } | { ok: false; budget: false; error: string }

/**
 * Una llamada a Search Console: separa "se acabó la cuota" (corta la tanda) de
 * "se rompió esta llamada" (se cuenta y se sigue). El heartbeat va después de
 * cada una porque una inspección puede tardar varios segundos y el lease del
 * lane `gsc` es de 10 minutos.
 */
async function intentar<T>(deps: GscSyncDeps, fn: () => Promise<T>): Promise<Intento<T>> {
  try {
    return { ok: true, value: await fn() }
  } catch (err) {
    if (err instanceof GscBudgetExhausted) return { ok: false, budget: true }
    return { ok: false, budget: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await deps.heartbeat()
  }
}

export async function runVuelosGscSync(deps: GscSyncDeps): Promise<GscSyncSummary> {
  const ahora = deps.now ?? (() => new Date())
  const started = Date.now()
  const feedpath = VUELOS_SITEMAP()

  let sitemapSubmitted = false
  let sitemap: SitemapStatus | null = null
  let statsRows = 0
  let inspected = 0
  let indexed = 0
  let errors = 0
  let budgetStopped = false

  const resumen = (): GscSyncSummary => ({
    sitemapSubmitted,
    sitemap,
    statsRows,
    inspected,
    indexed,
    errors,
    budgetStopped,
    durationMs: Date.now() - started,
  })

  // 1. Sitemap: el envío es idempotente (Google lo vuelve a encolar), así que
  //    se manda todos los días y recién después se lee cómo quedó.
  const envio = await intentar(deps, () => deps.gsc.submitSitemap(feedpath))
  if (!envio.ok && envio.budget) {
    budgetStopped = true
    return resumen()
  }
  if (envio.ok) sitemapSubmitted = true
  else {
    errors++
    await deps.log(`Search Console: no se pudo enviar el sitemap: ${envio.error}`, { feedpath }, 'warning')
  }

  const estado = await intentar(deps, () => deps.gsc.getSitemap(feedpath))
  if (!estado.ok && estado.budget) {
    budgetStopped = true
    return resumen()
  }
  if (estado.ok) {
    sitemap = estado.value
    if (sitemap) await deps.saveSitemapStatus({ ...sitemap, feedpath })
  } else {
    errors++
    await deps.log(`Search Console: no se pudo leer el estado del sitemap: ${estado.error}`, { feedpath }, 'warning')
  }

  // 2. Rendimiento: la primera vez el mes entero, después sólo la cola.
  const backfill = !(await deps.hasStats())
  const hoy = todayIso(ahora())
  const endDate = addDays(hoy, -PERFORMANCE_LAG_DAYS)
  const startDate = addDays(hoy, -(backfill ? PERFORMANCE_BACKFILL_DAYS : PERFORMANCE_INCREMENTAL_DAYS))
  const pagePrefix = publicBaseUrl()

  const stats = await intentar(deps, () =>
    deps.gsc.queryPages({ startDate, endDate, pagePrefix, rowLimit: PERFORMANCE_ROW_LIMIT })
  )
  if (!stats.ok && stats.budget) {
    budgetStopped = true
    return resumen()
  }
  if (stats.ok) {
    statsRows = stats.value.length
    if (statsRows > 0) await deps.saveStats(stats.value)
  } else {
    errors++
    await deps.log(`Search Console: no se pudieron leer clics e impresiones: ${stats.error}`, { startDate, endDate }, 'warning')
  }

  // 3. Inspección: las primeras `INSPECT_PER_RUN` URLs (landing + destinos
  //    activos). Una que falla no frena a las demás.
  for (const url of deps.urls.slice(0, INSPECT_PER_RUN)) {
    const r = await intentar(deps, () => deps.gsc.inspectUrl(url))
    if (!r.ok && r.budget) {
      budgetStopped = true
      break
    }
    if (!r.ok) {
      errors++
      await deps.log(`Search Console: falló la inspección de ${url}: ${r.error}`, { url }, 'warning')
      continue
    }
    await deps.saveUrlStatus(r.value)
    inspected++
    if (isIndexed(r.value)) indexed++
  }

  return resumen()
}
