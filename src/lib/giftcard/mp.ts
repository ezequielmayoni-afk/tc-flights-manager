/**
 * Mercado Pago Checkout Pro por REST (sin SDK), para las gift cards.
 *
 * - Preferencia: un solo ítem en pesos, `payment_methods.installments` y `default_installments`
 *   con las cuotas elegidas en la landing (MP abre el checkout ya con ese plan), `external_reference`
 *   = id del pedido, `notification_url` al webhook de HUB y `back_urls` a la landing de TC.
 * - Pago: siempre se relee `GET /v1/payments/{id}`; nunca se confía en la URL ni en el cuerpo de
 *   la notificación. Para conciliar, `GET /v1/payments/search?external_reference=`.
 * - Cuotas estimadas para mostrar: `GET /v1/payment_methods/installments` (tarjeta Visa como
 *   referencia; el importe exacto lo fija MP en el checkout según la tarjeta).
 * - Firma del webhook: `x-signature` (`ts=…,v1=…`) sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import { giftcardEnv, GIFTCARD_INSTALLMENT_OPTIONS } from './config'

export const MP_API = 'https://api.mercadopago.com'
const TIMEOUT_MS = 15_000

export class MpError extends Error {
  constructor(message: string, public status: number, public body?: unknown) { super(message) }
}

async function mpFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = giftcardEnv().mpAccessToken
  if (!token) throw new MpError('Falta MP_ACCESS_TOKEN', 503)
  const res = await fetch(`${MP_API}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  const text = await res.text()
  let body: unknown = text
  try { body = text ? JSON.parse(text) : null } catch { /* texto plano */ }
  if (!res.ok) throw new MpError(`Mercado Pago ${res.status} en ${path}: ${text.slice(0, 300)}`, res.status, body)
  return body as T
}

export interface OrderForPreference {
  id: string
  amountUsd: number
  amountArs: number
  installments: number
  buyer: { name: string; lastname: string; email: string; phone?: string | null; document?: string | null }
}

/** `2026-10-26T12:00:00.000-03:00`: formato con huso de los ejemplos de MP. */
export function mpDate(d: Date): string {
  return new Date(d.getTime() - 3 * 60 * 60 * 1000).toISOString().replace('Z', '-03:00')
}

export function preferenceBody(o: OrderForPreference, now: Date = new Date()) {
  const env = giftcardEnv()
  const back = `${env.landingUrl}${env.landingUrl.includes('?') ? '&' : '?'}gc=${o.id}`
  const n = Math.max(1, Math.min(12, Math.round(o.installments || 1)))
  const doc = (o.buyer.document ?? '').replace(/\D/g, '')
  return {
    items: [{ id: `giftcard-${o.amountUsd}`, title: `Gift Card Sí, Viajo · USD ${o.amountUsd}`.slice(0, 250), description: 'Voucher para viajar con Sí, Viajo. Vigencia 12 meses.', category_id: 'gift_cards', quantity: 1, currency_id: 'ARS', unit_price: o.amountArs }],
    payer: {
      name: o.buyer.name, surname: o.buyer.lastname, email: o.buyer.email,
      ...(o.buyer.phone ? { phone: { number: o.buyer.phone.replace(/\D/g, '').slice(-15) } } : {}),
      ...(doc ? { identification: { type: doc.length === 11 ? 'CUIL' : 'DNI', number: doc } } : {}),
    },
    back_urls: { success: back, pending: back, failure: back },
    auto_return: 'approved',
    external_reference: o.id,
    notification_url: `${env.hubBaseUrl}/api/giftcard/webhook?source_news=webhooks`,
    statement_descriptor: 'SIVIAJO',
    expires: true,
    expiration_date_from: mpDate(new Date(now.getTime() - 5 * 60_000)),
    expiration_date_to: mpDate(new Date(now.getTime() + 3 * 24 * 60 * 60_000)),
    payment_methods: { installments: n, default_installments: n, excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }] },
    metadata: { giftcard_order_id: o.id, amount_usd: o.amountUsd, installments: n },
  }
}

export async function createPreference(o: OrderForPreference): Promise<{ id: string; initPoint: string }> {
  const data = await mpFetch<{ id?: string; init_point?: string }>('/checkout/preferences', { method: 'POST', headers: { 'X-Idempotency-Key': `giftcard-${o.id}` }, body: JSON.stringify(preferenceBody(o)) })
  if (!data?.id || !data.init_point?.startsWith('https://')) throw new MpError('Mercado Pago devolvió una preferencia sin link de pago', 200, data)
  return { id: data.id, initPoint: data.init_point }
}

export interface MpPayment {
  id: string; status: string; status_detail?: string | null; external_reference?: string | null
  transaction_amount?: number | null; currency_id?: string | null; installments?: number | null; live_mode?: boolean | null
  payment_method_id?: string | null; payment_type_id?: string | null; date_approved?: string | null
}
export async function getPayment(id: string): Promise<MpPayment> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new MpError('Id de pago inválido', 400)
  const p = await mpFetch<MpPayment & { id: number | string }>(`/v1/payments/${id}`)
  return { ...p, id: String(p.id) }
}
export async function searchPayments(externalReference: string): Promise<MpPayment[]> {
  const r = await mpFetch<{ results?: Array<MpPayment & { id: number | string }> }>(`/v1/payments/search?external_reference=${encodeURIComponent(externalReference)}&sort=date_created&criteria=desc`)
  return (r.results ?? []).map((p) => ({ ...p, id: String(p.id) }))
}

export interface InstallmentQuote { n: number; installmentArs: number; totalArs: number; ratePct: number; label: string }
export interface MpPayerCost { installments: number; installment_rate: number; installment_amount: number; total_amount: number; recommended_message?: string }
export interface MpInstallmentEntry { issuer?: { id?: string; name?: string }; payer_costs?: MpPayerCost[] }
/** MP devuelve un plan por emisor (banco) y el orden cambia entre llamadas. Para cada cantidad de cuotas tomamos el plan
 *  más común entre los emisores (si empatan, el más caro), que es lo que paga una tarjeta típica. */
export function typicalInstallments(entries: MpInstallmentEntry[], wanted: readonly number[]): InstallmentQuote[] {
  const out: InstallmentQuote[] = []
  for (const n of wanted) {
    const buckets = new Map<string, { count: number; c: MpPayerCost }>()
    for (const e of entries) for (const c of e.payer_costs ?? []) {
      if (c.installments !== n) continue
      const k = `${c.installment_rate}:${Math.round(c.installment_amount)}`
      const b = buckets.get(k); if (b) b.count++; else buckets.set(k, { count: 1, c })
    }
    const best = [...buckets.values()].sort((a, b) => b.count - a.count || b.c.installment_rate - a.c.installment_rate)[0]
    if (best) out.push({ n, installmentArs: Math.round(best.c.installment_amount), totalArs: Math.round(best.c.total_amount), ratePct: best.c.installment_rate, label: best.c.recommended_message ?? '' })
  }
  return out
}
/** Cuotas estimadas para un monto en pesos (Visa como referencia), con caché de una hora. */
export async function installmentsFor(amountArs: number): Promise<InstallmentQuote[]> {
  const key = `giftcard:inst:${Math.round(amountArs)}`
  return ttlMemo(key, 60 * 60_000, async () => {
    const r = await mpFetch<MpInstallmentEntry[]>(`/v1/payment_methods/installments?amount=${Math.round(amountArs)}&payment_method_id=visa&locale=es-AR`)
    return typicalInstallments(Array.isArray(r) ? r : [], GIFTCARD_INSTALLMENT_OPTIONS as unknown as number[])
  })
}

// --- firma del webhook -------------------------------------------------------------
function hmacHex(secret: string, msg: string): string { return createHmac('sha256', secret).update(msg, 'utf8').digest('hex') }
function equalHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b)) return false
  const ba = Buffer.from(a.toLowerCase(), 'hex'); const bb = Buffer.from(b.toLowerCase(), 'hex')
  return ba.length === bb.length && ba.length > 0 && timingSafeEqual(ba, bb)
}
export function manifest(a: { dataId: string | null; requestId: string | null; ts: string }): string {
  const parts: string[] = []
  if (a.dataId) parts.push(`id:${a.dataId.toLowerCase()}`)
  if (a.requestId) parts.push(`request-id:${a.requestId}`)
  parts.push(`ts:${a.ts}`)
  return `${parts.join(';')};`
}
export function verifyWebhookSignature(a: { xSignature: string | null; xRequestId: string | null; dataId: string | null; secret: string }): boolean {
  if (!a.xSignature || !a.secret) return false
  const parts = Object.fromEntries(a.xSignature.split(',').map((p) => { const i = p.indexOf('='); return i < 0 ? ['', ''] : [p.slice(0, i).trim(), p.slice(i + 1).trim()] }))
  const ts = parts['ts']; const v1 = parts['v1']
  if (!ts || !v1) return false
  return equalHex(hmacHex(a.secret, manifest({ dataId: a.dataId, requestId: a.xRequestId, ts })), v1)
}
