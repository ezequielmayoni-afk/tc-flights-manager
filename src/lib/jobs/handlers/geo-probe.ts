import { getBudgetStatus, recordExternalCall } from '@/lib/jobs/budget'
import { LLM_PROBE_PROVIDER, type GeoEngine } from '@/lib/seo/config'
import { askChatGpt, isOpenAiConfigured } from '@/lib/seo/engines/openai'
import { askClaude, isClaudeConfigured } from '@/lib/seo/engines/claude'
import { askGemini, isGeminiConfigured } from '@/lib/seo/engines/gemini'
import type { EngineAnswer } from '@/lib/seo/geo'
import { LlmBudgetExhausted, runGeoProbe, type AskFn } from '@/lib/seo/geo-probe'
import { insertGeoProbe, listPrompts } from '@/lib/seo/queries'
import { isoWeekLabel } from '@/lib/tendencias/config'
import type { Db } from '@/lib/jobs/types'
import { FLAGS } from '../flags'
import type { HandlerDefinition } from '../types'

/**
 * Sondas a ChatGPT, Gemini y Claude, una vez por semana (Fase 14).
 *
 * Cada pregunta activa de `geo_prompts` (12) se hace a cada motor con
 * búsqueda web (36 preguntas). Cada una cuenta una unidad del presupuesto
 * `llm_probe` (60/día) y queda en `external_calls`, también si falla.
 */
function conPresupuesto(db: Db, jobId: number, engine: GeoEngine, ask: AskFn): AskFn {
  return async prompt => {
    const budget = await getBudgetStatus(db, LLM_PROBE_PROVIDER)
    if (budget.exhausted) throw new LlmBudgetExhausted(budget.pct)
    const started = Date.now()
    let status: 'ok' | 'error' | 'timeout' = 'ok'
    try {
      const answer: EngineAnswer = await ask(prompt)
      return answer
    } catch (err) {
      status = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError') ? 'timeout' : 'error'
      throw err
    } finally {
      await recordExternalCall(db, { provider: LLM_PROBE_PROVIDER, endpoint: `geo:${engine}`, units: 1, status, durationMs: Date.now() - started, jobId })
    }
  }
}

export const geoProbeHandler: HandlerDefinition = {
  kind: 'geo.probe',
  lane: 'default',
  flags: [FLAGS.geoProbes],
  provider: LLM_PROBE_PROVIDER,
  description: 'GEO: pregunta a ChatGPT, Gemini y Claude por agencias y paquetes y mide si nombran o citan a Sí, Viajo',
  handler: async ({ db, job, heartbeat, log }) => {
    const prompts = await listPrompts(db, { activeOnly: true })
    if (prompts.length === 0) return { ok: true, result: { prompts: 0, reason: 'sin preguntas activas en geo_prompts' } }

    const engines: Partial<Record<GeoEngine, AskFn>> = {}
    if (isOpenAiConfigured()) engines.chatgpt = conPresupuesto(db, job.id, 'chatgpt', askChatGpt)
    if (isGeminiConfigured()) engines.gemini = conPresupuesto(db, job.id, 'gemini', askGemini)
    if (isClaudeConfigured()) engines.claude = conPresupuesto(db, job.id, 'claude', askClaude)
    if (Object.keys(engines).length === 0) {
      return { ok: false, skipped: true, reason: 'ningún motor configurado (OPENAI_API_KEY, ANTHROPIC_API_KEY, GOOGLE_CLOUD_PROJECT_ID)' }
    }

    const week = typeof job.payload.week === 'string' ? job.payload.week : isoWeekLabel(new Date())
    const summary = await runGeoProbe({ prompts, week, engines, save: row => insertGeoProbe(db, row), heartbeat, log })

    const result = { ...summary, week }
    await log(
      `Sondas de IA ${week}: ${summary.answered}/${summary.asked} respuestas (${summary.engines.join(', ')}), ` +
        `Sí, Viajo mencionada en ${summary.mentioned} y citada en ${summary.cited}${summary.budgetStopped ? ' — presupuesto llm_probe agotado' : ''}`,
      result,
      summary.errors > 0 ? 'warning' : 'info'
    )

    if (summary.budgetStopped) return { ok: false, skipped: true, reason: `presupuesto llm_probe agotado (${summary.answered}/${summary.asked})`, result }
    if (summary.answered === 0) return { ok: false, error: 'ningún motor respondió', retry: true, result }
    return { ok: true, result }
  },
}
