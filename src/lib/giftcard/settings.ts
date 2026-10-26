/** Configuración editable de la Gift Card (tabla giftcard_settings, fila 1): tipo de cambio y coeficientes por cuotas. */
import { ttlMemo, ttlMemoForget } from '@/lib/vuelos-baratos/cache'
import { DEFAULT_PLANS, normalizePlans, type GiftcardPlan } from './quote'

export interface GiftcardSettings { fxRate: number | null; plans: GiftcardPlan[]; note: string; updatedAt: string | null; updatedBy: string | null }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = { from: (table: string) => any }
const KEY = 'giftcard:settings'
/** 15 s de caché: la landing pega al /config en cada visita y Ezequiel quiere ver el cambio enseguida. */
const TTL_MS = 15_000

export async function loadSettings(db: Db): Promise<GiftcardSettings> {
  return ttlMemo(KEY, TTL_MS, async () => {
    const { data } = await db.from('giftcard_settings').select('*').eq('id', 1).maybeSingle()
    const r = (data ?? {}) as Record<string, unknown>
    const fx = Number(r.fx_rate)
    return {
      fxRate: Number.isFinite(fx) && fx > 0 ? fx : null,
      plans: r.plans ? normalizePlans(r.plans) : DEFAULT_PLANS,
      note: typeof r.note === 'string' ? r.note : '',
      updatedAt: (r.updated_at as string | null) ?? null,
      updatedBy: (r.updated_by as string | null) ?? null,
    }
  })
}

export async function saveSettings(db: Db, patch: { fxRate?: number | null; plans?: GiftcardPlan[]; note?: string }, by: string | null): Promise<GiftcardSettings> {
  const row: Record<string, unknown> = { id: 1, updated_at: new Date().toISOString(), updated_by: by }
  if (patch.fxRate !== undefined) row.fx_rate = patch.fxRate && patch.fxRate > 0 ? patch.fxRate : null
  if (patch.plans) row.plans = normalizePlans(patch.plans)
  if (patch.note !== undefined) row.note = patch.note.slice(0, 300)
  const { error } = await db.from('giftcard_settings').upsert(row, { onConflict: 'id' })
  if (error) throw new Error(`No se pudo guardar la configuración de gift cards: ${error.message}`)
  ttlMemoForget(KEY)
  return loadSettings(db)
}
