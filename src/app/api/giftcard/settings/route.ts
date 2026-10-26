/** GET/PATCH /api/giftcard/settings: tipo de cambio y coeficientes por cuotas de la Gift Card (pantalla /giftcard de HUB). */
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { GIFTCARD_AMOUNTS_USD } from '@/lib/giftcard/config'
import { getFx, getTcRate } from '@/lib/giftcard/fx'
import { installmentsFor } from '@/lib/giftcard/mp'
import { cashArs } from '@/lib/giftcard/quote'
import { loadSettings, saveSettings } from '@/lib/giftcard/settings'

export const dynamic = 'force-dynamic'
const SECTION = 'comercial'

async function payload(db: ReturnType<typeof createAdminClient>) {
  const settings = await loadSettings(db)
  const tcRate = await getTcRate()
  const fx = await getFx(settings.fxRate).catch(() => null)
  // Referencia: lo que MP cobra hoy (plan más común entre bancos, Visa) para USD 100, por si Ezequiel quiere calibrar el coeficiente.
  const mpReference = fx ? await installmentsFor(cashArs(100, fx.rate)).then((l) => l.map((c) => ({ n: c.n, ratePct: c.ratePct }))).catch(() => []) : []
  return { settings, tcRate, fx: fx ? { rate: fx.rate, source: fx.source } : null, mpReference, amountsUsd: GIFTCARD_AMOUNTS_USD }
}

export async function GET() {
  const { authorized } = await checkSectionAccess(SECTION)
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try { return NextResponse.json(await payload(createAdminClient())) }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}

const patchSchema = z.object({
  fxRate: z.number().min(1).max(100000).nullable().optional(),
  plans: z.array(z.object({ n: z.number().int().min(1).max(24), coef: z.number().min(0.5).max(5), enabled: z.boolean() })).min(1).optional(),
  note: z.string().max(300).optional(),
})

export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess(SECTION)
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ') }, { status: 400 })
  try {
    const db = createAdminClient()
    await saveSettings(db, parsed.data, user?.email ?? null)
    return NextResponse.json(await payload(db))
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }) }
}
