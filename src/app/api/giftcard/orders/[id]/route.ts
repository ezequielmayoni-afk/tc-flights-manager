/** GET /api/giftcard/orders/{id}: estado del pedido para la pantalla de retorno (si MP ya aprobó y el webhook no llegó, concilia). */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getOrder, reconcileOrder } from '@/lib/giftcard/issue'
import { json, options } from '@/lib/giftcard/http'

export const dynamic = 'force-dynamic'
export async function OPTIONS(req: NextRequest) { return options(req.headers.get('origin')) }
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const origin = req.headers.get('origin'); const { id } = await ctx.params
  if (!/^[0-9a-f-]{36}$/.test(id)) return json(origin, { ok: false, error: 'Pedido inválido' }, 400)
  const db = createAdminClient()
  let order = await getOrder(db, id)
  if (!order) return json(origin, { ok: false, error: 'Pedido no encontrado' }, 404)
  if (order.status === 'pending' || order.status === 'paid') {
    const pid = req.nextUrl.searchParams.get('payment_id')
    try { order = await reconcileOrder(db, order) } catch { /* se informa el estado actual */ }
    void pid
  }
  return json(origin, { ok: true, id: order.id, status: order.status, amountUsd: Number(order.amount_usd), amountArs: Number(order.amount_ars), installments: order.installments, code: order.status === 'issued' ? order.code : null, validUntil: order.status === 'issued' ? order.valid_until : null, email: order.buyer_email.replace(/^(.).*(@.*)$/, '$1***$2'), pendingIssue: order.status === 'paid' })
}
