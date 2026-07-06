import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/supabase'
import { getTicketPrice } from '@/lib/data'
import { mpConfigured, createPreference, type MPItem } from '@/lib/mercadopago'

interface Body {
  buyer: { name?: string; email?: string; doc?: string; phone?: string }
  items: { eventSlug: string; categoryId: string; qty: number }[]
}

function baseUrl(req: NextRequest): string {
  return (
    process.env.PUBLIC_BASE_URL ||
    req.nextUrl.origin ||
    'http://localhost:3005'
  )
}

export async function POST(req: NextRequest) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const { buyer, items } = body
  if (!buyer?.name?.trim() || !buyer?.email?.trim()) {
    return NextResponse.json({ error: 'Faltan datos del comprador' }, { status: 400 })
  }
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: 'El carrito está vacío' }, { status: 400 })
  }

  // Revalidar cada ítem contra el precio y disponibilidad actuales de la BD.
  // Nunca confiamos en el precio que manda el cliente.
  const validated: {
    event_id: string
    event_name: string
    category_id: string
    sector_name: string
    unit_price: number
    qty: number
    currency: string
  }[] = []

  for (const it of items) {
    const qty = Math.max(1, Math.min(20, Math.floor(it.qty || 0)))
    const info = await getTicketPrice(it.eventSlug, it.categoryId)
    if (!info) {
      return NextResponse.json(
        { error: `Un sector ya no está disponible (${it.categoryId})` },
        { status: 409 }
      )
    }
    validated.push({
      event_id: info.eventId,
      event_name: info.eventName,
      category_id: it.categoryId,
      sector_name: info.sectorName,
      unit_price: info.price,
      qty,
      currency: info.currency,
    })
  }

  const currency = validated[0].currency
  const total = validated.reduce((n, v) => n + v.unit_price * v.qty, 0)

  // Crear la orden (pending) + ítems.
  const supabase = db()
  const { data: order, error: orderErr } = await supabase
    .from('f1_orders')
    .insert({
      status: 'pending',
      buyer_name: buyer.name,
      buyer_email: buyer.email,
      buyer_doc: buyer.doc || null,
      buyer_phone: buyer.phone || null,
      currency,
      total,
    })
    .select('id')
    .single()

  if (orderErr || !order) {
    console.error('[checkout] insert order:', orderErr?.message)
    return NextResponse.json({ error: 'No se pudo crear la orden' }, { status: 500 })
  }
  const orderId = order.id as string

  const { error: itemsErr } = await supabase.from('f1_order_items').insert(
    validated.map((v) => ({
      order_id: orderId,
      event_id: v.event_id,
      event_name: v.event_name,
      category_id: v.category_id,
      sector_name: v.sector_name,
      unit_price: v.unit_price,
      qty: v.qty,
      currency: v.currency,
    }))
  )
  if (itemsErr) {
    console.error('[checkout] insert items:', itemsErr.message)
    return NextResponse.json({ error: 'No se pudieron guardar los ítems' }, { status: 500 })
  }

  // Sin credenciales MP → modo pendiente (orden creada, sin cobro).
  if (!mpConfigured()) {
    return NextResponse.json({ orderId, pending: true })
  }

  // Crear preferencia de MercadoPago.
  try {
    const mpItems: MPItem[] = validated.map((v) => ({
      title: `${v.event_name} — ${v.sector_name}`,
      quantity: v.qty,
      unit_price: v.unit_price,
      currency_id: v.currency,
    }))
    const pref = await createPreference({
      orderId,
      items: mpItems,
      payer: { name: buyer.name, email: buyer.email },
      baseUrl: baseUrl(req),
    })
    await supabase
      .from('f1_orders')
      .update({ mp_preference_id: pref.id })
      .eq('id', orderId)
    return NextResponse.json({ orderId, init_point: pref.init_point })
  } catch (e) {
    console.error('[checkout] MP preference:', e)
    return NextResponse.json(
      { error: 'No se pudo iniciar el pago con MercadoPago' },
      { status: 502 }
    )
  }
}
