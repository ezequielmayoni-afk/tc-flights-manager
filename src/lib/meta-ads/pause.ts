import { getMetaAdsClient } from '@/lib/meta-ads/client'
import type { Db } from '@/lib/jobs/types'

/**
 * Pausar / activar anuncios con registro de quién y por qué, y recuento del
 * paquete. Lo usan la ruta manual (/api/meta/ads/status) y el guard.
 */

export type AdStatusTarget = 'ACTIVE' | 'PAUSED'

export interface SetAdsStatusInput {
  metaAdIds: string[]
  status: AdStatusTarget
  /** Motivo legible (regla del guard o "manual desde la pantalla"). */
  reason: string
  /** Quién: email del usuario o 'guard' / 'autopilot'. */
  actor: string
}

export interface SetAdsStatusResult {
  updated: string[]
  failed: Array<{ metaAdId: string; error: string }>
  packagesRecounted: number[]
}

export async function setAdsStatus(db: Db, input: SetAdsStatusInput): Promise<SetAdsStatusResult> {
  const metaClient = getMetaAdsClient()
  const now = new Date().toISOString()
  const updated: string[] = []
  const failed: Array<{ metaAdId: string; error: string }> = []

  for (const metaAdId of input.metaAdIds) {
    try {
      await metaClient.updateAdStatus(metaAdId, input.status)
      updated.push(metaAdId)
    } catch (err) {
      failed.push({ metaAdId, error: err instanceof Error ? err.message : String(err) })
    }
  }

  if (updated.length > 0) {
    const patch = input.status === 'PAUSED'
      ? { status: 'PAUSED', meta_status: 'PAUSED', paused_reason: input.reason, paused_by: input.actor, paused_at: now, updated_at: now }
      : { status: 'ACTIVE', meta_status: 'ACTIVE', paused_reason: null, paused_by: null, paused_at: null, updated_at: now }
    await db.from('meta_ads').update(patch).in('meta_ad_id', updated)
  }

  const { data: rows } = await db.from('meta_ads').select('package_id').in('meta_ad_id', updated)
  const packageIds = [...new Set(((rows ?? []) as Array<{ package_id: number | null }>).map(r => r.package_id).filter((id): id is number => id !== null))]
  for (const packageId of packageIds) await recountPackageAds(db, packageId)

  return { updated, failed, packagesRecounted: packageIds }
}

/** ads_active_count y marketing_status del paquete a partir de sus anuncios. */
export async function recountPackageAds(db: Db, packageId: number): Promise<number> {
  const { count } = await db.from('meta_ads').select('*', { count: 'exact', head: true }).eq('package_id', packageId).eq('status', 'ACTIVE')
  const active = count ?? 0
  await db.from('packages').update({ ads_active_count: active, marketing_status: active > 0 ? 'active' : 'paused' }).eq('id', packageId)
  return active
}

/** Todos los anuncios de un paquete (opcionalmente sólo los que maneja el sistema). */
export async function listPackageAdIds(db: Db, packageId: number, onlyAutoManaged = false): Promise<string[]> {
  let query = db.from('meta_ads').select('meta_ad_id, auto_managed').eq('package_id', packageId).neq('status', 'DELETED')
  if (onlyAutoManaged) query = query.eq('auto_managed', true)
  const { data } = await query
  return ((data ?? []) as Array<{ meta_ad_id: string }>).map(r => r.meta_ad_id)
}
