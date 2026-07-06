import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { getPayment, mpConfigured } from '@/lib/mercadopago'

// Notificaciones de MercadoPago (Checkout Pro). MP puede mandar el id del pago
// por query (?type=payment&data.id=) o en el body. Consultamos el pago y
// actualizamos la orden por su external_reference (orderId).
export async function POST(req: NextRequest) {
  if (!mpConfigured()) return NextResponse.json({ ok: true, skipped: true })

  let paymentId: string | null =
    req.nextUrl.searchParams.get('data.id') ||
    req.nextUrl.searchParams.get('id')
  const topic = req.nextUrl.searchParams.get('type') || req.nextUrl.searchParams.get('topic')

  try {
    const body = (await req.json().catch(() => null)) as
      | { type?: string; data?: { id?: string } }
      | null
    if (body?.data?.id) paymentId = String(body.data.id)
    if (!paymentId && body?.type !== 'payment' && topic !== 'payment') {
      return NextResponse.json({ ok: true, ignored: true })
    }
  } catch {
    /* body opcional */
  }

  if (!paymentId) return NextResponse.json({ ok: true, ignored: true })

  try {
    const payment = await getPayment(paymentId)
    const orderId = payment.external_reference
    const status = payment.status // approved | rejected | pending | in_process | cancelled
    if (!orderId) return NextResponse.json({ ok: true })

    const mapped =
      status === 'approved' ? 'paid' : status === 'rejected' || status === 'cancelled' ? 'failed' : 'pending'

    await db()
      .from('f1_orders')
      .update({
        status: mapped,
        mp_payment_id: String(paymentId),
        updated_at: new Date().toISOString(),
      })
      .eq('id', orderId)

    return NextResponse.json({ ok: true, status: mapped })
  } catch (e) {
    console.error('[mp webhook]', e)
    // Devolver 200 igual para que MP no reintente indefinidamente por errores nuestros.
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
