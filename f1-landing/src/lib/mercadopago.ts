// Integración MercadoPago (Checkout Pro por preferencia). Todo pasa por el token
// MP_ACCESS_TOKEN; si no está configurado, el checkout degrada a modo "pendiente"
// (crea la orden sin cobro) para poder probar el flujo end-to-end sin credenciales.

import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

export function mpConfigured(): boolean {
  return !!process.env.MP_ACCESS_TOKEN
}

function client() {
  const accessToken = process.env.MP_ACCESS_TOKEN
  if (!accessToken) throw new Error('MP_ACCESS_TOKEN no configurado')
  return new MercadoPagoConfig({ accessToken })
}

export interface MPItem {
  title: string
  quantity: number
  unit_price: number
  currency_id: string
}

export interface CreatePrefArgs {
  orderId: string
  items: MPItem[]
  payer: { name?: string; email?: string }
  baseUrl: string
}

/** Crea una preferencia y devuelve { id, init_point }. */
export async function createPreference(args: CreatePrefArgs) {
  const pref = new Preference(client())
  const res = await pref.create({
    body: {
      items: args.items.map((i, idx) => ({ id: `${args.orderId}-${idx}`, ...i })),
      payer: { name: args.payer.name, email: args.payer.email },
      external_reference: args.orderId,
      back_urls: {
        success: `${args.baseUrl}/checkout/exito?order=${args.orderId}`,
        failure: `${args.baseUrl}/checkout/error?order=${args.orderId}`,
        pending: `${args.baseUrl}/checkout/exito?order=${args.orderId}&pendiente=1`,
      },
      auto_return: 'approved',
      notification_url: `${args.baseUrl}/api/mp/webhook`,
    },
  })
  return { id: res.id, init_point: res.init_point }
}

/** Consulta un pago por id para el webhook. */
export async function getPayment(paymentId: string) {
  const payment = new Payment(client())
  return payment.get({ id: paymentId })
}
