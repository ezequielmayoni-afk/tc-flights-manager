import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildOperatorView, type OperatorCupoRow, type OwnCupo } from '@/lib/cupos/operator'
import { canLoad } from '@/lib/cupos/operator-load'

export const dynamic = 'force-dynamic'

/** GET /api/cupos/operadores — cupos de operadores mayoristas (Eurovips) por salida, con nuestros cupos cercanos. */
export async function GET() {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const { data: rows, error } = await db.from('operator_cupos').select('*').eq('active', true).gte('departure_date', today).order('departure_date').range(0, 4999)
    if (error) throw new Error(error.message)
    const list = (rows ?? []) as unknown as OperatorCupoRow[]

    // Primera foto de cada tarifa: cuántos lugares tenía cuando empezamos a mirar.
    const firstSeats = new Map<string, number>()
    const { data: hist } = await db.from('operator_cupos_history').select('departure_key, package_fare_id, departure_seats, captured_at').order('captured_at', { ascending: true }).range(0, 49999)
    for (const h of (hist ?? []) as Array<{ departure_key: string; package_fare_id: string; departure_seats: number | null }>) {
      const k = `${h.departure_key}|${h.package_fare_id}`
      if (!firstSeats.has(k) && h.departure_seats !== null) firstSeats.set(k, h.departure_seats)
    }

    // Nuestros cupos por volar: aeropuerto de llegada de la ida, fecha y lugares.
    const { data: flights } = await db.from('flights').select('id, name, start_date, active, operator_cupo_id, flight_segments(departure_location_code, arrival_location_code, sort_order), modalities(modality_inventories(quantity, remaining_seats))').eq('leg_type', 'outbound').gte('start_date', today).range(0, 4999)
    const ownCupos: OwnCupo[] = []
    for (const f of (flights ?? []) as Array<{ id: number; name: string; start_date: string; active: boolean; operator_cupo_id: number | null; flight_segments: Array<{ departure_location_code: string; arrival_location_code: string; sort_order: number }>; modalities: Array<{ modality_inventories: Array<{ quantity: number; remaining_seats: number | null }> }> }>) {
      if (!f.active || f.operator_cupo_id) continue // sólo cupos propios (no los cargados desde un operador)
      const segs = [...(f.flight_segments ?? [])].sort((a, b) => a.sort_order - b.sort_order)
      const inv = f.modalities?.[0]?.modality_inventories?.[0]
      if (!segs.length || !inv) continue
      ownCupos.push({ flightId: f.id, airport: segs[segs.length - 1].arrival_location_code, originAirport: segs[0].departure_location_code, date: f.start_date, total: inv.quantity, remaining: inv.remaining_seats ?? inv.quantity, name: f.name })
    }
    const { data: profiles } = await db.from('destination_profiles').select('name, family, iata_airport')

    const view = buildOperatorView(list, { firstSeats, ownCupos, profiles: (profiles ?? []) as never })
    // Cuáles ya se cargaron a la web y cuáles se pueden cargar.
    const { data: loaded } = await db.from('flights').select('id, operator_cupo_id').eq('leg_type', 'outbound').not('operator_cupo_id', 'is', null)
    const loadedBy = new Map(((loaded ?? []) as Array<{ id: number; operator_cupo_id: number }>).map(f => [Number(f.operator_cupo_id), f.id]))
    const byId = new Map(list.map(r => [r.id, r]))
    for (const v of view) {
      const flightId = loadedBy.get(v.id) ?? null
      const chk = canLoad(byId.get(v.id)!, today, flightId !== null)
      v.loadedFlightId = flightId; v.loadable = chk.ok; v.loadReason = chk.reason ?? null
    }
    const lastRun = list.reduce<string | null>((m, r) => (!m || r.last_seen_at > m ? r.last_seen_at : m), null)
    return NextResponse.json({ rows: view, lastRun, operator: 'Eurovips' })
  } catch (error) {
    return errorResponse(error)
  }
}
