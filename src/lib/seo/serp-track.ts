import type { JobContext } from '@/lib/jobs/types'
import { SerpApiBudgetExhausted } from '@/lib/serpapi/client'
import { readSerp, type SerpReading } from './serp'

/**
 * Seguimiento semanal de posiciones en Google Argentina (SerpAPI).
 *
 * Una búsqueda por consulta activa de `seo_keywords`; de cada página de
 * resultados se guarda la lectura de `readSerp`. Puro salvo por `search`,
 * que inyecta el handler con el cliente de SerpAPI ligado al presupuesto.
 */

/** Parámetros fijos: Google Argentina, castellano, 20 resultados (dos páginas de 10). */
export const SERP_PARAMS: Record<string, string> = {
  engine: 'google',
  hl: 'es-419',
  gl: 'ar',
  google_domain: 'google.com.ar',
  location: 'Buenos Aires,Buenos Aires,Argentina',
  num: '20',
}

export interface TrackedKeyword {
  id: number
  keyword: string
}

export interface SerpCheckInsert extends SerpReading {
  keywordId: number
  keyword: string
  week: string
}

export interface SerpTrackDeps {
  keywords: TrackedKeyword[]
  week: string
  search: (params: Record<string, string>) => Promise<Record<string, unknown>>
  save: (row: SerpCheckInsert) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
}

export interface SerpTrackSummary {
  keywords: number
  checked: number
  ranking: number
  top10: number
  inAiOverview: number
  errors: number
  budgetStopped: boolean
  durationMs: number
}

export async function runSerpTrack(deps: SerpTrackDeps): Promise<SerpTrackSummary> {
  const started = Date.now()
  const s: SerpTrackSummary = { keywords: deps.keywords.length, checked: 0, ranking: 0, top10: 0, inAiOverview: 0, errors: 0, budgetStopped: false, durationMs: 0 }

  for (const kw of deps.keywords) {
    try {
      const raw = await deps.search({ ...SERP_PARAMS, q: kw.keyword })
      const reading = readSerp(raw)
      await deps.save({ ...reading, keywordId: kw.id, keyword: kw.keyword, week: deps.week })
      s.checked++
      if (reading.position !== null) {
        s.ranking++
        if (reading.position <= 10) s.top10++
      }
      if (reading.inAiOverview) s.inAiOverview++
    } catch (err) {
      if (err instanceof SerpApiBudgetExhausted) {
        s.budgetStopped = true
        break
      }
      s.errors++
      await deps.log(`SERP "${kw.keyword}": ${err instanceof Error ? err.message : String(err)}`, undefined, 'warning')
    } finally {
      await deps.heartbeat()
    }
  }

  s.durationMs = Date.now() - started
  return s
}
