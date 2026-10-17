import { GSC_PROVIDER, createGscClient, gscSiteUrl, isGscConfigured } from '@/lib/gsc/client'
import { upsertPageStats } from '@/lib/gsc/queries'
import { INSPECT_PER_RUN, runSiteGscSync } from '@/lib/seo/site-sync'
import { hasQueryStats, upsertQueryStats, upsertSitemapList, upsertUrlStatusRow, urlsToInspect } from '@/lib/seo/queries'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/** Una URL inspeccionada hace menos de dos semanas no se vuelve a pedir. */
const INSPECT_STALE_DAYS = 14

/**
 * Search Console de todo siviajo.com, una vez por día (Fase 14).
 *
 * Baja clics e impresiones por página y por consulta (marcando marca vs.
 * no-marca), el estado de los sitemaps y una tanda de inspecciones rotando
 * por las URLs con más impresiones. Lane `gsc` (de a uno), presupuesto `gsc`
 * (100 llamadas/día compartidas con `gsc.vuelos_sync`): si se agota, termina
 * `skipped` y mañana sigue.
 */
export const gscSiteSyncHandler: HandlerDefinition = {
  kind: 'gsc.site_sync',
  lane: 'gsc',
  flags: [FLAGS.gscWrites],
  provider: GSC_PROVIDER,
  description: 'SEO: trae de Search Console clics, impresiones, consultas, sitemaps e indexación de todo siviajo.com',
  handler: async ({ db, job, heartbeat, log }) => {
    if (!isGscConfigured()) {
      return { ok: false, skipped: true, reason: 'Search Console no está configurado (falta GOOGLE_DRIVE_CREDENTIALS)' }
    }

    const site = gscSiteUrl()
    const gsc = createGscClient(db, { jobId: job.id })
    const summary = await runSiteGscSync({
      gsc,
      hasQueryStats: () => hasQueryStats(db, site),
      savePageStats: rows => upsertPageStats(db, rows.map(row => ({ ...row, site }))),
      saveQueryStats: rows => upsertQueryStats(db, site, rows),
      saveSitemaps: rows => upsertSitemapList(db, site, rows),
      urlsToInspect: () => urlsToInspect(db, { site, limit: INSPECT_PER_RUN, staleDays: INSPECT_STALE_DAYS }),
      saveUrlStatus: row => upsertUrlStatusRow(db, site, row),
      heartbeat,
      log,
    })

    const result = { ...summary, site, gscCalls: gsc.callsMade }
    await log(
      `Search Console ${site} (${summary.window.start} → ${summary.window.end}${summary.window.backfill ? ', backfill' : ''}): ` +
        `${summary.pageRows} filas de páginas, ${summary.queryRows} de consultas, ${summary.sitemaps} sitemaps, ` +
        `${summary.inspected} URLs inspeccionadas (${summary.indexed} indexadas)${summary.budgetStopped ? ' — cuota diaria agotada' : ''}`,
      result,
      summary.errors > 0 ? 'warning' : 'info'
    )

    if (summary.budgetStopped) {
      return { ok: false, skipped: true, reason: `presupuesto gsc agotado (${summary.inspected} inspecciones hechas)`, result }
    }
    if (summary.errors > 3) {
      return { ok: false, error: `Search Console: ${summary.errors} llamadas fallaron`, retry: true, result }
    }
    return { ok: true, result }
  },
}
