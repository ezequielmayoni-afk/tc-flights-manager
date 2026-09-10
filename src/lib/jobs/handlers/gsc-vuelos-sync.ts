import { GSC_PROVIDER, createGscClient, gscSiteUrl, isGscConfigured } from '@/lib/gsc/client'
import { hasPageStats, upsertPageStats, upsertSitemapStatus, upsertUrlStatus } from '@/lib/gsc/queries'
import { runVuelosGscSync } from '@/lib/gsc/vuelos-sync'
import { publicBaseUrl } from '@/lib/vuelos-baratos/config'
import { listLandingDestinations } from '@/lib/vuelos-baratos/queries'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Search Console de vuelos.siviajo.com, una vez por día.
 *
 * Reenvía el sitemap (el envío es idempotente: Google lo vuelve a encolar),
 * guarda cómo lo ve, trae clics e impresiones de las páginas de la landing e
 * inspecciona hasta 20 URLs para saber cuáles están indexadas. Va por el lane
 * `gsc` (de a uno) y gasta del presupuesto `gsc`, 100 llamadas por día: si se
 * agota, termina `skipped` y mañana sigue donde quedó.
 *
 * Un dominio nuevo tarda días o semanas en indexarse: al principio la
 * inspección va a decir "Google no reconoce esta URL" y eso NO es un error del
 * job.
 */
export const gscVuelosSyncHandler: HandlerDefinition = {
  kind: 'gsc.vuelos_sync',
  lane: 'gsc',
  flags: [FLAGS.gscWrites],
  provider: GSC_PROVIDER,
  description: 'Vuelos baratos: reenvía el sitemap a Search Console y trae indexación, clics e impresiones de la landing',
  handler: async ({ db, job, heartbeat, log }) => {
    // `createGscApi()` lanza sin credenciales: mejor omitir el job que fallarlo.
    if (!isGscConfigured()) {
      return { ok: false, skipped: true, reason: 'Search Console no está configurado (falta GOOGLE_DRIVE_CREDENTIALS)' }
    }

    const site = gscSiteUrl()
    const base = publicBaseUrl()
    const destinations = await listLandingDestinations(db, { activeOnly: true })
    // La landing primero: es la que más importa que esté indexada, y si la
    // cuota corta a mitad de camino se pierden las de abajo.
    const urls = [`${base}/vuelos-baratos`, ...destinations.map(d => `${base}/vuelos-baratos/${d.slug}`)]

    const gsc = createGscClient(db, { jobId: job.id })
    const summary = await runVuelosGscSync({
      gsc,
      urls,
      hasStats: () => hasPageStats(db, site),
      saveStats: rows => upsertPageStats(db, rows.map(row => ({ ...row, site }))),
      saveUrlStatus: row => upsertUrlStatus(db, { ...row, site }),
      saveSitemapStatus: row => upsertSitemapStatus(db, { ...row, site }),
      heartbeat,
      log,
    })

    const result = { ...summary, site, urls: urls.length, gscCalls: gsc.callsMade }
    await log(
      `Search Console ${site}: ${summary.inspected}/${urls.length} URLs inspeccionadas (${summary.indexed} indexadas)` +
        `, ${summary.statsRows} filas de métricas` +
        `${summary.sitemap ? `, sitemap ${summary.sitemap.isPending ? 'pendiente' : 'procesado'}` : ''}` +
        `${summary.budgetStopped ? ' — cuota diaria agotada' : ''}`,
      result,
      summary.errors > 0 ? 'warning' : 'info'
    )

    if (summary.budgetStopped) {
      return { ok: false, skipped: true, reason: `presupuesto gsc agotado (${summary.inspected}/${urls.length} URLs inspeccionadas)` }
    }
    // Una inspección que falla no dice nada; cuatro es la API caída o la
    // propiedad sin permiso, y ahí sí conviene reintentar.
    if (summary.errors > 3) {
      return { ok: false, error: `Search Console: ${summary.errors} llamadas fallaron`, retry: true, result }
    }
    return { ok: true, result }
  },
}
