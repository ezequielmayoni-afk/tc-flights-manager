import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const schema = z.object({ flightId: z.number().int().positive(), returnFlightId: z.number().int().positive().nullable().optional() })

/**
 * POST — el alta de vuelos terminó: enlaza los vuelos creados con la tirada,
 * guarda el costo por plaza en el cupo y, si todas las aceptadas están
 * cargadas, cierra el pedido como "loaded".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ optionId: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const optionId = Number((await params).optionId)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('flightId')
    const db = createAdminClient()
    const { data: opt } = await db.from('cupo_request_options').select('id, request_id, airline_price_pp, airline_currency, deposit_due_date, balance_due_date, release_date, name_list_due_date, payment_conditions, cancellation_terms').eq('id', optionId).maybeSingle()
    if (!opt) throw API_ERRORS.NOT_FOUND('La tirada')
    const now = new Date().toISOString()
    const ids = [parsed.data.flightId, ...(parsed.data.returnFlightId ? [parsed.data.returnFlightId] : [])]
    await db.from('flights').update({ cupo_option_id: optionId, cost_per_seat: opt.airline_price_pp ?? null, cost_currency: opt.airline_currency ?? 'USD', deposit_due_date: opt.deposit_due_date ?? null, balance_due_date: opt.balance_due_date ?? null, release_date: opt.release_date ?? null, name_list_due_date: opt.name_list_due_date ?? null, payment_conditions: [opt.payment_conditions, opt.cancellation_terms].filter(Boolean).join(' · ') || null }).in('id', ids)
    await db.from('cupo_request_options').update({ status: 'loaded', flight_id: parsed.data.flightId, return_flight_id: parsed.data.returnFlightId ?? null, updated_at: now }).eq('id', optionId)
    const { data: siblings } = await db.from('cupo_request_options').select('status').eq('request_id', opt.request_id).in('status', ['accepted', 'loaded'])
    if ((siblings ?? []).length > 0 && (siblings ?? []).every(s => s.status === 'loaded')) await db.from('cupo_requests').update({ status: 'loaded', updated_at: now }).eq('id', opt.request_id)
    await logEvent(db, { source: 'cupos', action: 'cupo_option.loaded', message: `Tirada ${optionId} cargada como cupo (vuelos ${ids.join('+')})`, entityType: 'cupo_request', entityId: opt.request_id, details: parsed.data }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
