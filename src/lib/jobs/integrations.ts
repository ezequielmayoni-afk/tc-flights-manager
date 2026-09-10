import type { Db } from './types'

export type IntegrationHealth = 'ok' | 'degraded' | 'down' | 'unknown'

export interface IntegrationStatusRow {
  provider: string
  status: IntegrationHealth
  checked_at: string | null
  token_expires_at: string | null
  details: Record<string, unknown> | null
  updated_at: string
}

/** Estado de salud de un proveedor externo (meta, tc, cotizador, serpapi, crm, slack, gsc, vuelos). */
export async function setIntegrationStatus(
  db: Db,
  provider: string,
  input: { status: IntegrationHealth; details?: Record<string, unknown>; tokenExpiresAt?: string | null; replaceDetails?: boolean }
): Promise<void> {
  const now = new Date().toISOString()
  // Los detalles se fusionan: la sincronización horaria no debe pisar lo que
  // guardó el chequeo de salud (moneda de la cuenta, permisos del token).
  const existing = await getIntegrationStatus(db, provider)
  const details = input.replaceDetails ? (input.details ?? null) : { ...(existing?.details ?? {}), ...(input.details ?? {}) }
  const { error } = await db.from('integration_status').upsert({
    provider,
    status: input.status,
    checked_at: now,
    token_expires_at: input.tokenExpiresAt === undefined ? (existing?.token_expires_at ?? null) : input.tokenExpiresAt,
    details,
    updated_at: now,
  }, { onConflict: 'provider' })
  if (error) console.error(`[integrations] No se pudo guardar el estado de ${provider}:`, error.message)
}

export async function getIntegrationStatus(db: Db, provider: string): Promise<IntegrationStatusRow | null> {
  const { data } = await db.from('integration_status').select('*').eq('provider', provider).maybeSingle()
  return (data as IntegrationStatusRow | null) ?? null
}

/** true si el proveedor está caído o degradado: los jobs que escriben en él sólo proponen. */
export async function isIntegrationDegraded(db: Db, provider: string): Promise<boolean> {
  const row = await getIntegrationStatus(db, provider)
  return row?.status === 'down' || row?.status === 'degraded'
}
