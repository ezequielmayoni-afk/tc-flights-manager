import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { groupsFor, loadRequest } from '@/lib/cupos/requests'
import { buildTiradas, datesFromStored, storeAnalysis, type StoredAnalysis } from '@/lib/cupos/tiradas'

export const dynamic = 'force-dynamic'
const schema = z.object({ airlineCode: z.string().trim().min(1).max(40) })

/** POST — rearma las tiradas sondeadas con otra aerolínea, usando las opciones del último sondeo (no consulta al cotizador). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('airlineCode obligatorio')
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const { request: r } = loaded
    if (!['draft', 'ready'].includes(r.status)) throw API_ERRORS.BAD_REQUEST(`El pedido está ${r.status}: la aerolínea se cambia antes de enviarlo`)
    const stored = r.airline_analysis as unknown as StoredAnalysis | null
    if (!stored?.dates?.length) throw API_ERRORS.BAD_REQUEST('No hay sondeo guardado: volvé a sondear')
    const { groups, legacy } = groupsFor(r)
    const dates = datesFromStored(stored)
    const code = parsed.data.airlineCode.toUpperCase()
    const { rows, decision } = buildTiradas({ requestId: id, legacy, maxOptions: r.max_options, singleAirline: true, dates, prefs: [...new Set(groups.flatMap(g => g.airlinePref))], forceAirline: code })
    if (rows.length === 0) throw API_ERRORS.BAD_REQUEST(`${code} no tiene opciones en las fechas sondeadas`)
    await db.from('cupo_request_options').delete().eq('request_id', id).eq('status', 'probed')
    const { data: kept } = await db.from('cupo_request_options').select('departure_date, nights, airline_code, flight_out').eq('request_id', id)
    const keys = new Set((kept ?? []).map(k => `${k.departure_date}|${k.nights}|${k.airline_code}|${k.flight_out}`))
    const fresh = rows.filter(x => { const k = `${x.departure_date}|${x.nights}|${x.airline_code}|${x.flight_out}`; if (keys.has(k)) return false; keys.add(k); return true }).map((x, i) => ({ ...x, rank: i + 1 }))
    if (fresh.length) { const { error } = await db.from('cupo_request_options').insert(fresh); if (error) throw new Error(error.message) }
    await db.from('cupo_requests').update({ airline_analysis: storeAnalysis(dates, decision, true, stored.intel, true), probe_error: rows.length < dates.length ? `${decision?.chosenName ?? code} no tiene opción en ${dates.length - rows.length} fecha(s)` : null, updated_at: new Date().toISOString() }).eq('id', id)
    await logEvent(db, { source: 'cupos', action: 'cupo_request.airline_changed', message: `Pedido #${id}: tiradas rearmadas con ${decision?.chosenName ?? code} (${fresh.length})`, entityType: 'cupo_request', entityId: id, details: { airline: code } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, tiradas: fresh.length, airline: decision?.chosenName ?? code })
  } catch (error) {
    return errorResponse(error)
  }
}
