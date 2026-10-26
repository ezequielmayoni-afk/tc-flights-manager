/** GET /api/giftcard/config: montos, cotización y cuotas estimadas para el widget de la landing. Público (CORS siviajo.com). */
import { NextRequest } from 'next/server'
import { GIFTCARD_AMOUNTS_USD, GIFTCARD_INSTALLMENT_OPTIONS, GIFTCARD_MAX_USD, GIFTCARD_MIN_USD, GIFTCARD_VALIDITY_MONTHS, giftcardEnv } from '@/lib/giftcard/config'
import { getFx, usdToArs } from '@/lib/giftcard/fx'
import { installmentsFor } from '@/lib/giftcard/mp'
import { json, options } from '@/lib/giftcard/http'

export const dynamic = 'force-dynamic'
export async function OPTIONS(req: NextRequest) { return options(req.headers.get('origin')) }
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const fx = await getFx()
    const amounts = await Promise.all(GIFTCARD_AMOUNTS_USD.map(async (usd) => {
      const ars = usdToArs(usd, fx.rate)
      const installments = await installmentsFor(ars).catch(() => [])
      return { usd, ars, installments }
    }))
    return json(origin, { ok: true, amounts, custom: { minUsd: GIFTCARD_MIN_USD, maxUsd: GIFTCARD_MAX_USD }, fx: { rate: fx.rate, fetchedAt: fx.fetchedAt }, installmentOptions: GIFTCARD_INSTALLMENT_OPTIONS, validityMonths: GIFTCARD_VALIDITY_MONTHS, whatsapp: giftcardEnv().whatsapp, mpConfigured: !!giftcardEnv().mpAccessToken }, 200, { 'Cache-Control': 'public, max-age=300' })
  } catch (e) {
    return json(origin, { ok: false, error: (e as Error).message.slice(0, 200) }, 500)
  }
}
