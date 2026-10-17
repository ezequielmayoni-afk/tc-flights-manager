import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'

export const dynamic = 'force-dynamic'

const schema = z.object({ options: z.array(z.object({ id: z.number().int().positive(), airlinePricePp: z.number().min(0).nullable(), currency: z.string().max(3).default('USD'), notes: z.string().max(300).nullable().optional() })).min(1) })

/** POST — aéreos (o quien reciba la respuesta) carga el precio por plaza de cada tirada. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('options[{id, airlinePricePp, currency, notes}]')
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const now = new Date().toISOString()
    const actor = user?.email ?? 'ui'
    let quoted = 0
    for (const o of parsed.data.options) {
      if (!loaded.options.some(x => x.id === o.id)) continue
      const row: Record<string, unknown> = { airline_price_pp: o.airlinePricePp, airline_currency: o.currency, airline_notes: o.notes ?? null, updated_at: now }
      if (o.airlinePricePp !== null) { row.airline_quoted_at = now; row.status = 'quoted'; quoted++ }
      await db.from('cupo_request_options').update(row).eq('id', o.id).in('status', ['probed', 'requested', 'quoted'])
    }
    if (quoted > 0 && ['sent', 'ready', 'draft'].includes(loaded.request.status)) {
      await db.from('cupo_requests').update({ status: 'answered', answered_at: loaded.request.answered_at ?? now, answered_by: loaded.request.answered_by ?? actor, updated_at: now }).eq('id', id)
    }
    await logEvent(db, { source: 'cupos', action: 'cupo_request.answered', message: `Pedido #${id}: ${quoted} tirada(s) con precio de aéreos`, entityType: 'cupo_request', entityId: id, details: parsed.data }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, quoted })
  } catch (error) {
    return errorResponse(error)
  }
}
