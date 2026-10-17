import { SERPAPI_PROVIDER, createSerpApiClient } from '@/lib/serpapi/client'
import { insertSerpCheck, listKeywords } from '@/lib/seo/queries'
import { runSerpTrack } from '@/lib/seo/serp-track'
import { isoWeekLabel } from '@/lib/tendencias/config'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Posiciones en Google Argentina, una vez por semana (Fase 14).
 *
 * Una búsqueda de SerpAPI por consulta activa de `seo_keywords` (~45): dónde
 * aparece siviajo.com, si hay AI Overview y a quién cita, pack local, PAA.
 * Lane `serpapi` (de a uno), presupuesto `serpapi` (250/día, compartido con
 * Tendencias que corre el mismo lunes: 42 llamadas).
 */
export const serpTrackHandler: HandlerDefinition = {
  kind: 'serp.track',
  lane: 'serpapi',
  flags: [FLAGS.serpapiCalls],
  provider: SERPAPI_PROVIDER,
  description: 'SEO: mide la posición de siviajo.com en Google AR para las consultas de seo_keywords (SerpAPI)',
  handler: async ({ db, job, heartbeat, log }) => {
    if (!process.env.SERPAPI_API_KEY) {
      return { ok: false, skipped: true, reason: 'SerpAPI no está configurada (falta SERPAPI_API_KEY)' }
    }
    const keywords = await listKeywords(db, { activeOnly: true })
    if (keywords.length === 0) return { ok: true, result: { keywords: 0, reason: 'sin consultas activas en seo_keywords' } }

    const week = typeof job.payload.week === 'string' ? job.payload.week : isoWeekLabel(new Date())
    const serp = createSerpApiClient({ db, jobId: job.id, usage: 'seo' })
    const summary = await runSerpTrack({
      keywords,
      week,
      search: params => serp.search(params),
      save: row => insertSerpCheck(db, row),
      heartbeat,
      log,
    })

    const result = { ...summary, week, serpCalls: serp.callsMade }
    await log(
      `SERP ${week}: ${summary.checked}/${summary.keywords} consultas medidas, ${summary.ranking} con siviajo.com en página (${summary.top10} en top 10), ` +
        `${summary.inAiOverview} citadas en AI Overview${summary.budgetStopped ? ' — presupuesto de SerpAPI agotado' : ''}`,
      result,
      summary.errors > 0 ? 'warning' : 'info'
    )

    if (summary.budgetStopped) return { ok: false, skipped: true, reason: `presupuesto serpapi agotado (${summary.checked}/${summary.keywords})`, result }
    if (summary.errors > 5) return { ok: false, error: `SerpAPI: ${summary.errors} búsquedas fallaron`, retry: true, result }
    return { ok: true, result }
  },
}
