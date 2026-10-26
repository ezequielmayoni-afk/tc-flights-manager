/** GET /api/giftcard/config: montos, cotización y cuotas estimadas para el widget de la landing. Público (CORS siviajo.com). */
import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { GIFTCARD_AMOUNTS_USD, GIFTCARD_MAX_USD, GIFTCARD_MIN_USD, GIFTCARD_VALIDITY_MONTHS, giftcardEnv } from '@/lib/giftcard/config'
import { getFx } from '@/lib/giftcard/fx'
import { cashArs, quotePlans } from '@/lib/giftcard/quote'
import { loadSettings } from '@/lib/giftcard/settings'
import { json, options } from '@/lib/giftcard/http'

export const dynamic = 'force-dynamic'
export async function OPTIONS(req: NextRequest) { return options(req.headers.get('origin')) }
export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  try {
    const settings = await loadSettings(createAdminClient())
    const fx = await getFx(settings.fxRate)
    const plans = settings.plans.filter((p) => p.enabled).map((p) => ({ n: p.n, coef: p.coef }))
    const amounts = GIFTCARD_AMOUNTS_USD.map((usd) => { const ars = cashArs(usd, fx.rate); return { usd, ars, installments: quotePlans(ars, settings.plans) } })
    return json(origin, { ok: true, amounts, custom: { minUsd: GIFTCARD_MIN_USD, maxUsd: GIFTCARD_MAX_USD }, plans, fx: { rate: fx.rate, source: fx.source, fetchedAt: fx.fetchedAt }, installmentOptions: plans.map((p) => p.n), validityMonths: GIFTCARD_VALIDITY_MONTHS, whatsapp: giftcardEnv().whatsapp, mpConfigured: !!giftcardEnv().mpAccessToken }, 200, { 'Cache-Control': 'public, max-age=30' })
  } catch (e) {
    return json(origin, { ok: false, error: (e as Error).message.slice(0, 200) }, 500)
  }
}
