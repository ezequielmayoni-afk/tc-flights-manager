import { createAdminClient } from '@/lib/supabase/admin'
import type { Db } from '@/lib/jobs/types'

/**
 * Umbral único de cambio de precio (%). Antes el cron usaba 5 % y los
 * imports 10 %, hardcodeados; la pantalla de configuración editaba un valor
 * que nadie leía. Ahora todos leen notification_settings.price_change_threshold_pct.
 */
export const DEFAULT_PRICE_CHANGE_THRESHOLD_PCT = 5

export async function getPriceChangeThresholdPct(db: Db): Promise<number> {
  const { data } = await db.from('notification_settings').select('price_change_threshold_pct').eq('id', 1).maybeSingle()
  const value = Number((data as { price_change_threshold_pct?: number | null } | null)?.price_change_threshold_pct)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_PRICE_CHANGE_THRESHOLD_PCT
}

let cached: { value: number; at: number } | null = null

/** Igual que getPriceChangeThresholdPct pero con cliente propio y caché de 60 s (para imports y refresh). */
export async function getPriceChangeThresholdPctCached(): Promise<number> {
  if (cached && Date.now() - cached.at < 60_000) return cached.value
  const value = await getPriceChangeThresholdPct(createAdminClient())
  cached = { value, at: Date.now() }
  return value
}

export const DEFAULT_REQUOTE_VARIANCE_THRESHOLD_PCT = 10

/** Suba máxima del precio recotizado sobre el objetivo antes de pedir revisión manual (el bot viejo usaba 10 %). */
export async function getRequoteVarianceThresholdPct(db: Db): Promise<number> {
  const { data } = await db.from('notification_settings').select('requote_variance_threshold_pct').eq('id', 1).maybeSingle()
  const value = Number((data as { requote_variance_threshold_pct?: number | null } | null)?.requote_variance_threshold_pct)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_REQUOTE_VARIANCE_THRESHOLD_PCT
}
