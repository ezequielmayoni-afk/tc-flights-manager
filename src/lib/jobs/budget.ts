import type { Db } from './types'

export interface BudgetStatus {
  provider: string
  dailyCap: number | null
  monthlyCap: number | null
  spentToday: number
  spentMonth: number
  /** Porcentaje consumido del tope más ajustado (día o mes). */
  pct: number
  alertPct: number
  exhausted: boolean
}

function startOfDayUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
}

function startOfMonthUtc(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

async function sumUnits(db: Db, provider: string, since: string): Promise<number> {
  const { data, error } = await db
    .from('external_calls')
    .select('units')
    .eq('provider', provider)
    .gte('created_at', since)
  if (error) {
    console.error(`[budget] No se pudo sumar el consumo de ${provider}:`, error.message)
    return 0
  }
  return (data as { units: number }[]).reduce((acc, row) => acc + (row.units || 0), 0)
}

/**
 * Consumo del proveedor contra sus topes. Sin fila en provider_budgets no hay
 * tope: el proveedor corre libre (pero igual se registra cada llamada).
 */
export async function getBudgetStatus(db: Db, provider: string, now: Date = new Date()): Promise<BudgetStatus> {
  const { data: budget } = await db
    .from('provider_budgets')
    .select('daily_cap, monthly_cap, alert_pct')
    .eq('provider', provider)
    .maybeSingle()

  const [spentToday, spentMonth] = await Promise.all([
    sumUnits(db, provider, startOfDayUtc(now)),
    sumUnits(db, provider, startOfMonthUtc(now)),
  ])

  const dailyCap = budget?.daily_cap ?? null
  const monthlyCap = budget?.monthly_cap ?? null
  const dayPct = dailyCap ? (spentToday / dailyCap) * 100 : 0
  const monthPct = monthlyCap ? (spentMonth / monthlyCap) * 100 : 0
  const pct = Math.max(dayPct, monthPct)

  return {
    provider,
    dailyCap,
    monthlyCap,
    spentToday,
    spentMonth,
    pct: Math.round(pct),
    alertPct: budget?.alert_pct ?? 80,
    exhausted: (dailyCap !== null && spentToday >= dailyCap) || (monthlyCap !== null && spentMonth >= monthlyCap),
  }
}

/**
 * Registra una llamada externa. Se llama SIEMPRE, aunque la llamada falle:
 * SerpAPI cobra la búsqueda igual y el cotizador ocupó el worker igual.
 */
export async function recordExternalCall(
  db: Db,
  input: {
    provider: string
    endpoint?: string
    units?: number
    status?: 'ok' | 'error' | 'timeout'
    durationMs?: number
    jobId?: number | null
  }
): Promise<void> {
  const { error } = await db.from('external_calls').insert({
    provider: input.provider,
    endpoint: input.endpoint ?? null,
    units: input.units ?? 1,
    status: input.status ?? 'ok',
    duration_ms: input.durationMs ?? null,
    job_id: input.jobId ?? null,
  })
  if (error) console.error('[budget] No se pudo registrar la llamada externa:', error.message)
}
