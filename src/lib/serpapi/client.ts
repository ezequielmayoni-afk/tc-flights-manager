import { getBudgetStatus, recordExternalCall } from '@/lib/jobs/budget'
import type { Db } from '@/lib/jobs/types'

/**
 * Cliente de SerpAPI para HUB.
 *
 * Cada búsqueda queda registrada en `external_calls` (proveedor `serpapi`,
 * una unidad por llamada, también cuando falla: SerpAPI la cobra igual) y se
 * frena sola si el presupuesto de `provider_budgets` está agotado. Lo usan
 * Tendencias (Fase 1), las fechas de vuelo (Fase 3) y Competencia (Fase 13).
 */

const SERPAPI_BASE = 'https://serpapi.com/search.json'
const DEFAULT_TIMEOUT_MS = 30_000

export const SERPAPI_PROVIDER = 'serpapi'

export class SerpApiBudgetExhausted extends Error {
  constructor(pct: number) {
    super(`Presupuesto de SerpAPI agotado (${pct}%)`)
    this.name = 'SerpApiBudgetExhausted'
  }
}

export interface SerpApiClient {
  /** Una búsqueda. Lanza si falla o si no queda presupuesto. */
  search(params: Record<string, string>): Promise<Record<string, unknown>>
  /** Llamadas hechas por esta instancia (para el resumen del job). */
  readonly callsMade: number
}

export interface SerpApiClientOptions {
  db: Db
  /** Job que hace las llamadas; queda en external_calls.job_id. */
  jobId?: number | null
  /** Etiqueta del uso (ej. 'tendencias'); queda en external_calls.endpoint junto al engine. */
  usage?: string
  timeoutMs?: number
  /** Si es false no consulta provider_budgets antes de cada llamada. */
  enforceBudget?: boolean
}

function apiKey(): string {
  const key = process.env.SERPAPI_API_KEY
  if (!key) throw new Error('SERPAPI_API_KEY no está configurada')
  return key
}

/**
 * Crea un cliente ligado a un job. La verificación de presupuesto se hace
 * antes de cada llamada porque un job largo puede cruzar el tope a mitad de
 * camino; el runner sólo lo mira al empezar.
 */
export function createSerpApiClient(options: SerpApiClientOptions): SerpApiClient {
  const { db, jobId = null, usage = 'serpapi', timeoutMs = DEFAULT_TIMEOUT_MS, enforceBudget = true } = options
  let callsMade = 0

  return {
    get callsMade() {
      return callsMade
    },
    async search(params) {
      if (enforceBudget) {
        const budget = await getBudgetStatus(db, SERPAPI_PROVIDER)
        if (budget.exhausted) throw new SerpApiBudgetExhausted(budget.pct)
      }

      const url = new URL(SERPAPI_BASE)
      url.searchParams.set('api_key', apiKey())
      for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

      const endpoint = `${usage}:${params.engine ?? 'google'}${params.data_type ? `:${params.data_type}` : ''}`
      const started = Date.now()
      let status: 'ok' | 'error' | 'timeout' = 'ok'
      callsMade++

      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
        if (!response.ok) {
          status = 'error'
          const text = await response.text().catch(() => '')
          throw new Error(`SerpAPI ${response.status}: ${text.slice(0, 200)}`)
        }
        const data = (await response.json()) as Record<string, unknown>
        if (typeof data.error === 'string') {
          status = 'error'
          throw new Error(`SerpAPI: ${data.error}`)
        }
        return data
      } catch (err) {
        if (err instanceof Error && err.name === 'TimeoutError') status = 'timeout'
        else if (status === 'ok') status = 'error'
        throw err
      } finally {
        await recordExternalCall(db, {
          provider: SERPAPI_PROVIDER,
          endpoint,
          units: 1,
          status,
          durationMs: Date.now() - started,
          jobId,
        })
      }
    },
  }
}
