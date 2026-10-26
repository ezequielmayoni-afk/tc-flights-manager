/** POST /api/giftcard/orders: crea el pedido y la preferencia de Mercado Pago con las cuotas elegidas; devuelve el link de pago. */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GIFTCARD_INSTALLMENT_OPTIONS, GIFTCARD_MAX_USD, GIFTCARD_MIN_USD, giftcardEnv } from '@/lib/giftcard/config'
import { getFx, usdToArs } from '@/lib/giftcard/fx'
import { createPreference } from '@/lib/giftcard/mp'
import { json, options } from '@/lib/giftcard/http'

export const dynamic = 'force-dynamic'
export async function OPTIONS(req: NextRequest) { return options(req.headers.get('origin')) }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
function str(v: unknown, max: number): string { return typeof v === 'string' ? v.trim().slice(0, max) : '' }

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const env = giftcardEnv()
  if (!env.mpAccessToken) return json(origin, { ok: false, error: 'La venta de gift cards no está habilitada todavía' }, 503)
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return json(origin, { ok: false, error: 'Cuerpo inválido' }, 400) }
  const amountUsd = Math.round(Number(body.amountUsd))
  const installments = Math.round(Number(body.installments ?? 1))
  const buyer = (body.buyer ?? {}) as Record<string, unknown>
  const name = str(buyer.name, 60), lastname = str(buyer.lastname, 60), email = str(buyer.email, 145).toLowerCase(), phone = str(buyer.phone, 40), document = str(buyer.document, 20).replace(/\D/g, '')
  const recipientName = str(body.recipientName, 80) || null, message = str(body.message, 300) || null
  const errors: string[] = []
  if (!Number.isFinite(amountUsd) || amountUsd < GIFTCARD_MIN_USD || amountUsd > GIFTCARD_MAX_USD) errors.push(`El monto tiene que estar entre USD ${GIFTCARD_MIN_USD} y USD ${GIFTCARD_MAX_USD}`)
  if (!(GIFTCARD_INSTALLMENT_OPTIONS as readonly number[]).includes(installments)) errors.push('Cuotas inválidas')
  if (name.length < 2) errors.push('Falta el nombre'); if (lastname.length < 2) errors.push('Falta el apellido')
  if (!EMAIL.test(email)) errors.push('El email no es válido'); if (phone.replace(/\D/g, '').length < 8) errors.push('Falta el teléfono')
  if (document && !(document.length === 7 || document.length === 8 || document.length === 11)) errors.push('El DNI o CUIL no es válido')
  if (errors.length) return json(origin, { ok: false, error: errors.join('. ') }, 400)
  try {
    const fx = await getFx(); const amountArs = usdToArs(amountUsd, fx.rate)
    const db = createAdminClient()
    const source = { origin, referer: req.headers.get('referer'), ua: req.headers.get('user-agent')?.slice(0, 200), fxSource: fx.source }
    const { data, error } = await db.from('giftcard_orders').insert({ amount_usd: amountUsd, amount_ars: amountArs, fx_rate: fx.rate, installments, buyer_name: name, buyer_lastname: lastname, buyer_email: email, buyer_phone: phone, buyer_document: document || null, recipient_name: recipientName, message, source }).select('id').single()
    if (error || !data) return json(origin, { ok: false, error: 'No se pudo guardar el pedido' }, 500)
    const pref = await createPreference({ id: data.id as string, amountUsd, amountArs, installments, buyer: { name, lastname, email, phone, document } })
    await db.from('giftcard_orders').update({ mp_preference_id: pref.id, mp_init_point: pref.initPoint, updated_at: new Date().toISOString() }).eq('id', data.id)
    return json(origin, { ok: true, id: data.id, initPoint: pref.initPoint, amountArs, installments })
  } catch (e) {
    console.error('[giftcard] no se pudo crear el pedido:', (e as Error).message)
    return json(origin, { ok: false, error: 'No pudimos iniciar el pago. Probá de nuevo en un minuto o escribinos por WhatsApp.' }, 502)
  }
}
