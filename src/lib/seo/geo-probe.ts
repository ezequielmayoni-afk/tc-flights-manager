import type { JobContext } from '@/lib/jobs/types'
import { GEO_ENGINES, type GeoEngine } from './config'
import { readAnswer, type EngineAnswer, type GeoReading } from './geo'

/**
 * Sondas semanales a los motores de IA (ChatGPT, Gemini, Claude): cada
 * pregunta de `geo_prompts` se hace a cada motor con búsqueda web, y se
 * guarda si la respuesta nombra o cita a Sí, Viajo y a qué competidores.
 *
 * Puro salvo por `engines`, que inyecta el handler. Una sonda que falla se
 * guarda igual (con `error`), para que el tablero muestre que ese motor no
 * respondió y el share of voice no la cuente.
 */

export class LlmBudgetExhausted extends Error {
  constructor(pct: number) {
    super(`Presupuesto de sondas a IA agotado (${pct}%)`)
    this.name = 'LlmBudgetExhausted'
  }
}

export interface GeoPromptRow {
  id: number
  prompt: string
}

export interface GeoProbeInsert extends GeoReading {
  promptId: number
  engine: GeoEngine
  week: string
  model: string | null
  answer: string | null
  citations: string[]
  error: string | null
}

export type AskFn = (prompt: string) => Promise<EngineAnswer>

export interface GeoProbeDeps {
  prompts: GeoPromptRow[]
  week: string
  /** Motores disponibles: uno que falte (sin credenciales) se omite y se loguea. */
  engines: Partial<Record<GeoEngine, AskFn>>
  save: (row: GeoProbeInsert) => Promise<void>
  heartbeat: () => Promise<void>
  log: JobContext['log']
}

export interface GeoProbeSummary {
  prompts: number
  engines: GeoEngine[]
  asked: number
  answered: number
  mentioned: number
  cited: number
  errors: number
  budgetStopped: boolean
  durationMs: number
}

export async function runGeoProbe(deps: GeoProbeDeps): Promise<GeoProbeSummary> {
  const started = Date.now()
  const engines = GEO_ENGINES.filter(e => !!deps.engines[e])
  const s: GeoProbeSummary = { prompts: deps.prompts.length, engines, asked: 0, answered: 0, mentioned: 0, cited: 0, errors: 0, budgetStopped: false, durationMs: 0 }

  const faltan = GEO_ENGINES.filter(e => !deps.engines[e])
  if (faltan.length > 0) await deps.log(`Sondas de IA: sin credenciales para ${faltan.join(', ')}; se omiten`, undefined, 'warning')

  bucle: for (const p of deps.prompts) {
    for (const engine of engines) {
      const ask = deps.engines[engine]!
      s.asked++
      try {
        const answer = await ask(p.prompt)
        const reading = readAnswer(answer)
        await deps.save({ ...reading, promptId: p.id, engine, week: deps.week, model: answer.model, answer: answer.text, citations: answer.citations, error: null })
        s.answered++
        if (reading.mentioned) s.mentioned++
        if (reading.cited) s.cited++
      } catch (err) {
        if (err instanceof LlmBudgetExhausted) {
          s.budgetStopped = true
          break bucle
        }
        s.errors++
        const message = err instanceof Error ? err.message : String(err)
        await deps.save({ promptId: p.id, engine, week: deps.week, model: null, answer: null, citations: [], mentioned: false, cited: false, citedUrls: [], competitors: [], error: message.slice(0, 500) })
        await deps.log(`Sonda ${engine} "${p.prompt.slice(0, 60)}…": ${message}`, undefined, 'warning')
      } finally {
        await deps.heartbeat()
      }
    }
  }

  s.durationMs = Date.now() - started
  return s
}
