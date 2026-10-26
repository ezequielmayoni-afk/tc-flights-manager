/**
 * Ciclo de vida del pedido de gift card: pendiente → pagado (MP aprobó) → emitido
 * (código creado en TC + email enviado). Idempotente: se puede llamar desde el webhook,
 * desde la página de retorno y desde el job de conciliación a la vez.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendSlackMessage } from '@/lib/slack/client'
import { giftcardEnv, GIFTCARD_PENDING_EXPIRES_DAYS, GIFTCARD_RECONCILE_AFTER_MIN } from './config'
import { getPayment, searchPayments, type MpPayment } from './mp'
import { createTcPromoCode, generateCode, validUntilFrom } from './voucher'
import { sendMail, voucherMail } from './email'

type Db = SupabaseClient
export interface GiftcardOrder {
  id: string; status: string; amount_usd: number; amount_ars: number; installments: number
  buyer_name: string; buyer_lastname: string; buyer_email: string; buyer_phone: string | null; buyer_document: string | null
  recipient_name: string | null; message: string | null
  mp_preference_id: string | null; mp_init_point: string | null; mp_payment_id: string | null; mp_status: string | null
  code: string | null; tc_promocode_id: number | null; valid_until: string | null; voucher_sent_at: string | null; issue_error: string | null
  created_at: string; paid_at: string | null
}

async function slack(text: string) {
  const url = giftcardEnv().slackWebhook
  if (!url) return
  try { await sendSlackMessage(url, { text } as never) } catch { /* el aviso no puede romper el flujo */ }
}

export async function getOrder(db: Db, id: string): Promise<GiftcardOrder | null> {
  const { data } = await db.from('giftcard_orders').select('*').eq('id', id).maybeSingle()
  return (data as GiftcardOrder | null) ?? null
}

/** Aplica el estado de un pago de MP al pedido. Devuelve el pedido actualizado. */
export async function applyPayment(db: Db, payment: MpPayment): Promise<GiftcardOrder | null> {
  const ref = payment.external_reference
  if (!ref) return null
  const order = await getOrder(db, ref)
  if (!order) return null
  const approved = payment.status === 'approved'
  const amountOk = approved && Math.abs(Number(payment.transaction_amount ?? 0) - Number(order.amount_ars)) < 1 && (payment.currency_id ?? 'ARS') === 'ARS'
  const patch: Record<string, unknown> = { mp_payment_id: payment.id, mp_status: payment.status, mp_status_detail: payment.status_detail ?? null, mp_paid_amount: payment.transaction_amount ?? null, mp_installments: payment.installments ?? null, updated_at: new Date().toISOString() }
  if (order.status === 'pending' || order.status === 'rejected') {
    if (approved && amountOk) { patch.status = 'paid'; patch.paid_at = payment.date_approved ?? new Date().toISOString() }
    else if (approved && !amountOk) { patch.status = 'failed'; patch.issue_error = `Pago aprobado por ${payment.transaction_amount} ${payment.currency_id} y el pedido es de ${order.amount_ars} ARS` }
    else if (['rejected', 'cancelled'].includes(payment.status)) patch.status = 'rejected'
  }
  await db.from('giftcard_orders').update(patch).eq('id', order.id)
  const updated = { ...order, ...patch } as GiftcardOrder
  if (updated.status === 'paid') return issueVoucher(db, updated)
  if (updated.status === 'failed') await slack(`⚠️ Gift card ${order.id}: ${patch.issue_error}`)
  return updated
}

/** Crea el código en TC y manda el email. Si TC falla, el pedido queda "paid" con el error para reintentar. */
export async function issueVoucher(db: Db, order: GiftcardOrder): Promise<GiftcardOrder> {
  if (order.status === 'issued') return order
  // reservar el código (único) primero, así dos procesos no emiten dos vouchers
  let code = order.code
  if (!code) {
    for (let i = 0; i < 5 && !code; i++) {
      const candidate = generateCode()
      const { error } = await db.from('giftcard_orders').update({ code: candidate, updated_at: new Date().toISOString() }).eq('id', order.id).is('code', null)
      if (!error) { const fresh = await getOrder(db, order.id); code = fresh?.code ?? null }
    }
  }
  if (!code) { await db.from('giftcard_orders').update({ issue_error: 'No se pudo reservar un código', updated_at: new Date().toISOString() }).eq('id', order.id); return { ...order, issue_error: 'No se pudo reservar un código' } }
  const validUntil = order.valid_until ?? validUntilFrom(new Date(order.paid_at ?? Date.now()))
  let tcId = order.tc_promocode_id
  if (!tcId) {
    try {
      const r = await createTcPromoCode(code, Number(order.amount_usd), validUntil, order.id)
      tcId = r.id
      await db.from('giftcard_orders').update({ tc_promocode_id: tcId, valid_until: validUntil, issue_error: null, updated_at: new Date().toISOString() }).eq('id', order.id)
    } catch (e) {
      const msg = `TC no creó el código ${code}: ${(e as Error).message.slice(0, 300)}`
      await db.from('giftcard_orders').update({ valid_until: validUntil, issue_error: msg, updated_at: new Date().toISOString() }).eq('id', order.id)
      await slack(`🚨 Gift card ${order.id} pagada (USD ${order.amount_usd}, ${order.buyer_email}) pero ${msg}. Crear el código a mano o reintentar con giftcard.reconcile.`)
      return { ...order, code, valid_until: validUntil, issue_error: msg }
    }
  }
  if (!order.voucher_sent_at) {
    const mail = voucherMail({ to: order.buyer_email, buyerName: order.buyer_name, code, amountUsd: Number(order.amount_usd), validUntil, recipientName: order.recipient_name, message: order.message })
    const sent = await sendMail(mail)
    if (!sent.ok) {
      await db.from('giftcard_orders').update({ issue_error: `Email: ${sent.error}`, updated_at: new Date().toISOString() }).eq('id', order.id)
      await slack(`⚠️ Gift card ${code} (USD ${order.amount_usd}) creada en TC pero el email a ${order.buyer_email} falló: ${sent.error}`)
      return { ...order, code, tc_promocode_id: tcId, valid_until: validUntil, issue_error: `Email: ${sent.error}` }
    }
    await db.from('giftcard_orders').update({ voucher_sent_at: new Date().toISOString(), status: 'issued', issue_error: null, updated_at: new Date().toISOString() }).eq('id', order.id)
  } else {
    await db.from('giftcard_orders').update({ status: 'issued', issue_error: null, updated_at: new Date().toISOString() }).eq('id', order.id)
  }
  await slack(`🎁 Gift card vendida: USD ${order.amount_usd} (${Math.round(Number(order.amount_ars)).toLocaleString('es-AR')} ARS, ${order.installments} cuota/s) · ${order.buyer_name} ${order.buyer_lastname} · código ${code}`)
  return { ...order, code, tc_promocode_id: tcId, valid_until: validUntil, status: 'issued', issue_error: null }
}

/** Confirma un pago por id (webhook o retorno). */
export async function confirmPaymentById(paymentId: string, db: Db = createAdminClient()): Promise<GiftcardOrder | null> {
  const payment = await getPayment(paymentId)
  return applyPayment(db, payment)
}

/** Busca en MP los pagos de un pedido que sigue pendiente (retorno sin id o conciliación). */
export async function reconcileOrder(db: Db, order: GiftcardOrder): Promise<GiftcardOrder> {
  if (order.status === 'paid') return issueVoucher(db, order)
  if (order.status !== 'pending' && order.status !== 'rejected') return order
  const payments = await searchPayments(order.id)
  const best = payments.find((p) => p.status === 'approved') ?? payments[0]
  if (!best) return order
  return (await applyPayment(db, best)) ?? order
}

export async function reconcilePending(db: Db = createAdminClient()): Promise<{ checked: number; issued: number; expired: number; errors: number }> {
  const since = new Date(Date.now() - GIFTCARD_PENDING_EXPIRES_DAYS * 24 * 60 * 60_000).toISOString()
  const before = new Date(Date.now() - GIFTCARD_RECONCILE_AFTER_MIN * 60_000).toISOString()
  const { data } = await db.from('giftcard_orders').select('*').in('status', ['pending', 'paid']).lte('created_at', before).gte('created_at', since).order('created_at').limit(200)
  const out = { checked: 0, issued: 0, expired: 0, errors: 0 }
  for (const o of (data ?? []) as GiftcardOrder[]) {
    out.checked++
    try { const r = await reconcileOrder(db, o); if (r.status === 'issued' && o.status !== 'issued') out.issued++ } catch { out.errors++ }
  }
  const { data: old } = await db.from('giftcard_orders').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('status', 'pending').lt('created_at', since).select('id')
  out.expired = (old ?? []).length
  return out
}
