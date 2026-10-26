/**
 * El voucher de la gift card = un código de promoción de Travel Compositor (API REST
 * `POST /promotioncode/{microsite}`): monto fijo en USD, un solo uso, vigencia 12 meses,
 * válido para todos los productos del sitio. El cliente lo canjea en el checkout de
 * siviajo.com ("¿Tenés un código?") o con un asesor.
 */
import { randomBytes } from 'node:crypto'
import { tcClient } from '@/lib/travelcompositor/client'
import { giftcardEnv, GIFTCARD_VALIDITY_MONTHS } from './config'

/** SV-XXXX-XXXX sin caracteres ambiguos (0/O, 1/I/L). */
export function generateCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = randomBytes(8)
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length])
  return `SV-${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}`
}

export function validUntilFrom(paidAt: Date): string {
  const d = new Date(paidAt); d.setMonth(d.getMonth() + GIFTCARD_VALIDITY_MONTHS)
  return d.toISOString().slice(0, 10)
}

/** Productos sobre los que aplica el código (los que vende el microsite). */
export const GIFTCARD_TRIP_TYPES = ['HOLIDAYS', 'FLIGHT_HOTEL', 'ONLY_FLIGHT', 'ONLY_HOTEL', 'MULTI', 'ONLY_TICKET', 'ONLY_TRANSFER', 'ONLY_CAR', 'CRUISES']

export function promoCodeBody(code: string, amountUsd: number, validUntil: string, orderId: string) {
  const name = `Gift Card ${code}`
  return {
    promotionCode: code,
    promotionCodeType: 'USES',
    active: true,
    showAlert: true,
    microsite: giftcardEnv().tcMicrosite,
    redeemDate: validUntil,
    tripTypes: GIFTCARD_TRIP_TYPES,
    dailyUses: 0,
    userBalance: false,
    userBalanceB2B: false,
    usedInDeferredPayment: false,
    modalities: [{
      name, discount: amountUsd, currency: 'USD', fixedAmount: true, percentage: false,
      tripTypes: GIFTCARD_TRIP_TYPES, limitUses: 1, limitOfUsesPerUser: 1, dailyUses: 0, active: true,
      toBookingDate: validUntil, minTripAmount: amountUsd, minTripAmountCurrency: 'USD',
      maxAmountDiscount: amountUsd, maxCurrencyDiscount: 'USD', notAllowedForOnePax: false,
      removeAgencyManagementFeeAndOvercommission: false, balance: `1 uses`,
    }],
    // referencia para auditoría (TC la ignora si no la conoce)
    externalReference: `giftcard:${orderId}`,
  }
}

export async function createTcPromoCode(code: string, amountUsd: number, validUntil: string, orderId: string): Promise<{ id: number | null; raw: unknown }> {
  const r = tcClient as unknown as { request: (p: string, o?: RequestInit) => Promise<unknown> }
  const raw = await r.request(`/promotioncode/${giftcardEnv().tcMicrosite}`, { method: 'POST', body: JSON.stringify(promoCodeBody(code, amountUsd, validUntil, orderId)) })
  const id = typeof raw === 'object' && raw && 'id' in raw ? Number((raw as { id: unknown }).id) : null
  return { id: Number.isFinite(id as number) ? (id as number) : null, raw }
}

/** Busca el código en TC (para verificar que quedó creado). */
export async function findTcPromoCode(code: string): Promise<Record<string, unknown> | null> {
  const r = tcClient as unknown as { request: (p: string, o?: RequestInit) => Promise<unknown> }
  const list = await r.request(`/promotioncode/${giftcardEnv().tcMicrosite}`, { method: 'GET' })
  const arr = (Array.isArray(list) ? list : []) as Array<Record<string, unknown>>
  return arr.find((x) => x.promotionCode === code) ?? null
}
