/** Cotización USD→ARS de la Gift Card: la que Ezequiel carga en HUB (giftcard_settings.fx_rate) y, si está vacía, la manual de TC. */
import { tcClient } from '@/lib/travelcompositor/client'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import { giftcardEnv } from './config'

export interface FxQuote { rate: number; source: 'hub' | 'tc' | 'env'; fetchedAt: string; markupPct: number }

async function readTcRate(): Promise<number | null> {
  const r = tcClient as unknown as { request: (p: string, o?: RequestInit) => Promise<unknown> }
  const data = (await r.request(`/microsites/${giftcardEnv().tcMicrosite}/manual-exchange-rates`, { method: 'GET' })) as { manualExchangeRates?: Array<{ origin: string; target: string; rate: number }> }
  const row = (data.manualExchangeRates ?? []).find((x) => x.origin === 'USD' && x.target === 'ARS')
  return row && row.rate > 0 ? row.rate : null
}

/** Cotización manual de TC (la misma que usa siviajo.com), con caché de una hora; null si TC no responde. */
export async function getTcRate(): Promise<number | null> {
  return ttlMemo('giftcard:fx:tc', 60 * 60_000, async () => readTcRate().catch(() => null))
}

/** `override` es el tipo de cambio cargado en HUB; si no hay, TC (+ recargo opcional por env) o el fallback por env. */
export async function getFx(override?: number | null): Promise<FxQuote> {
  if (override && override > 0) return { rate: override, source: 'hub', fetchedAt: new Date().toISOString(), markupPct: 0 }
  const markupPct = giftcardEnv().fxMarkupPct
  const tc = await getTcRate()
  const fallback = Number(process.env.GIFTCARD_FX_RATE_FALLBACK || '0') || 0
  const base = tc ?? fallback
  if (!base) throw new Error('No hay cotización USD→ARS: no está cargada en HUB, TC no respondió y no hay GIFTCARD_FX_RATE_FALLBACK')
  return { rate: base * (1 + markupPct / 100), source: tc ? 'tc' : 'env', fetchedAt: new Date().toISOString(), markupPct }
}

/** Pesos enteros (Mercado Pago acepta decimales, pero el precio mostrado es en pesos redondos). */
export function usdToArs(amountUsd: number, rate: number): number {
  return Math.round(amountUsd * rate)
}
