/** POST /api/giftcard/webhook: notificaciones de pagos de Mercado Pago. Verifica la firma si hay MP_WEBHOOK_SECRET; siempre relee el pago en la API. */
import { NextRequest, NextResponse } from 'next/server'
import { giftcardEnv } from '@/lib/giftcard/config'
import { verifyWebhookSignature } from '@/lib/giftcard/mp'
import { confirmPaymentById } from '@/lib/giftcard/issue'

export const dynamic = 'force-dynamic'
const NOSTORE = { 'Cache-Control': 'no-store' }
export async function POST(req: NextRequest) {
  const url = req.nextUrl
  const dataId = url.searchParams.get('data.id')?.trim() || null
  let body: { type?: unknown; action?: unknown; data?: { id?: unknown } } = {}
  try { body = (await req.json()) as typeof body } catch { /* la firma no usa el cuerpo */ }
  const secret = giftcardEnv().mpWebhookSecret
  if (secret) {
    const ok = verifyWebhookSignature({ xSignature: req.headers.get('x-signature'), xRequestId: req.headers.get('x-request-id'), dataId, secret })
    if (!ok) return NextResponse.json({ ok: false, error: 'Firma inválida' }, { status: 401, headers: NOSTORE })
  }
  const type = url.searchParams.get('type') ?? (typeof body.type === 'string' ? body.type : null)
  if (type !== 'payment') return NextResponse.json({ ok: true, ignored: type ?? 'sin tipo' }, { headers: NOSTORE })
  const id = dataId ?? (body.data?.id !== undefined ? String(body.data.id) : null)
  if (!id) return NextResponse.json({ ok: false, error: 'Falta data.id' }, { status: 400, headers: NOSTORE })
  try {
    const order = await confirmPaymentById(id)
    return NextResponse.json({ ok: true, order: order?.id ?? null, status: order?.status ?? 'sin pedido' }, { headers: NOSTORE })
  } catch (e) {
    console.error('[giftcard] webhook falló para el pago', id, (e as Error).message)
    return NextResponse.json({ ok: false, error: 'Reintentar' }, { status: 500, headers: NOSTORE })
  }
}
