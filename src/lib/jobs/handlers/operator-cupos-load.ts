import { createSabreShopper, SABRE_PROVIDER } from '@/lib/sabre/client'
import { canLoad, directItineraryFromKnown, flightFields, inventorySeats, knownLeg, matchItinerary, OPERATOR_SUPPLIERS, sabreDestination, segmentRows } from '@/lib/cupos/operator-load'
import type { OperatorCupoRow } from '@/lib/cupos/operator'
import { syncSingleFlight } from '@/lib/travelcompositor/sync-flight'
import { tcClient } from '@/lib/travelcompositor/client'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'

/**
 * Carga a la web cupos de operadores (Eurovips…): por cada tarifa elegida en
 * /flights/operadores verifica el vuelo en Sabre, crea ida y vuelta en HUB con el
 * proveedor del operador y los tramos de Sabre, y los sube a TC casados (ida → vuelta).
 */
const FLIGHT_SELECT = '*, flight_segments(*), flight_datasheets(*), flight_cancellations(*), modalities(*, modality_inventories(*))'
const DROP = ['id', 'created_at', 'updated_at', 'sync_status', 'last_sync_at', 'sync_error', 'risk_level', 'risk_evaluated_at', 'tc_pushed_total', 'cupo_option_id', 'deposit_due_date', 'balance_due_date', 'release_date', 'name_list_due_date']

interface Result { id: number; ok: boolean; flight?: string; ida?: number; vuelta?: number; tc?: string[]; warnings?: string[]; reason?: string }

async function loadOne(db: Db, row: OperatorCupoRow, shop: ReturnType<typeof createSabreShopper>, template: Record<string, unknown>, log: (m: string) => Promise<void>): Promise<Result> {
  const today = new Date().toISOString().slice(0, 10)
  const { data: existing } = await db.from('flights').select('id').eq('operator_cupo_id', row.id).limit(1)
  const check = canLoad(row, today, Boolean(existing?.length))
  if (!check.ok) return { id: row.id, ok: false, reason: check.reason }
  const label = `${row.airline_code}${row.flight_out} ${row.origin_code}-${row.destination_code} ${row.departure_date}`

  const res = await shop.shop({ originIata: row.origin_code, destIata: sabreDestination(row.destination_code), departDate: row.departure_date, returnDate: row.return_date!, adults: 1, maxItineraries: 50, airlineCode: row.airline_code! })
  let m = res.status === 'ok' ? matchItinerary(row, res.itineraries) : { itinerary: null, warnings: [] as string[], reason: res.status === 'empty' ? `Sabre no devolvió vuelos de ${row.airline_code} para esas fechas` : `Sabre: ${res.error.slice(0, 120)}` }
  if (!m.itinerary) {
    // Low cost que Sabre no tiene: si es directo, aeropuertos de nuestros cupos con el mismo número de vuelo.
    const dest = sabreDestination(row.destination_code)
    const { data: known } = await db.from('flight_segments').select('num_service, departure_location_code, arrival_location_code').limit(5000)
    const segs = (known ?? []) as Array<{ num_service: string | null; departure_location_code: string; arrival_location_code: string }>
    const out = knownLeg(segs, row.flight_out, dest, null), back = knownLeg(segs, row.flight_back, null, dest)
    const direct = directItineraryFromKnown(row, out, back)
    if (!direct) return { id: row.id, ok: false, flight: label, reason: m.reason }
    m = { itinerary: direct, warnings: [`Sabre no tiene el vuelo (${(m.reason ?? '').slice(0, 60)}): aeropuertos de nuestros cupos con el mismo número (${out!.from}-${out!.to}) y horarios del operador`] }
  }
  const itin = m.itinerary!

  const base = Object.fromEntries(Object.entries(template).filter(([k]) => !DROP.includes(k)))
  const seats = inventorySeats(row)
  const ids: number[] = []
  for (const leg of ['outbound', 'return'] as const) {
    const fields = flightFields(row, itin, leg)
    const { data: f, error } = await db.from('flights').insert({ ...base, ...fields }).select('id, start_date').single()
    if (error || !f) {
      if (ids.length) await db.from('flights').delete().in('id', ids)
      return { id: row.id, ok: false, flight: label, reason: `No se pudo crear el vuelo en HUB: ${error?.message}` }
    }
    ids.push(f.id)
    const segs = segmentRows(leg === 'outbound' ? itin.segmentsOut! : itin.segmentsBack!, leg, row.airline_name)
    const { error: e1 } = await db.from('flight_segments').insert(segs.map(s => ({ ...s, flight_id: f.id })))
    if (e1) throw new Error(`segmentos: ${e1.message}`)
    const { data: mod, error: e2 } = await db.from('modalities').insert({ flight_id: f.id, code: 'MOD-01', active: true, cabin_class_type: 'ECONOMY', baggage_allowance: 'Según condiciones del operador', baggage_allowance_type: 'KG', min_passengers: 1, max_passengers: Math.max(1, Math.min(seats, 10)), on_request: false, includes_backpack: true, carryon_weight: 0, checked_bag_weight: 0, checked_bags_quantity: 0 }).select('id').single()
    if (e2 || !mod) throw new Error(`modalidad: ${e2?.message}`)
    const { error: e3 } = await db.from('modality_inventories').insert({ modality_id: mod.id, start_date: f.start_date, end_date: f.start_date, quantity: seats, sold: 0 })
    if (e3) throw new Error(`inventario: ${e3.message}`)
  }
  const [idaId, vtaId] = ids
  await db.from('flights').update({ paired_flight_id: vtaId }).eq('id', idaId)
  await db.from('flights').update({ paired_flight_id: idaId }).eq('id', vtaId)

  // TC: vuelta primero; la ida se sube y se re-sincroniza con la vuelta como combinable (casado de un solo lado).
  const load = async (id: number) => (await db.from('flights').select(FLIGHT_SELECT).eq('id', id).single()).data as never
  const rv = await syncSingleFlight(db as never, await load(vtaId))
  if (!rv.success) return { id: row.id, ok: false, flight: label, ida: idaId, vuelta: vtaId, reason: `TC (vuelta): ${rv.error}` }
  const ri = await syncSingleFlight(db as never, await load(idaId))
  if (!ri.success) return { id: row.id, ok: false, flight: label, ida: idaId, vuelta: vtaId, reason: `TC (ida): ${ri.error}` }
  const rl = await syncSingleFlight(db as never, await load(idaId), [rv.transportId!])
  const supplierId = OPERATOR_SUPPLIERS[row.operator].supplierId
  const tcIda = await (tcClient as unknown as { request: (p: string) => Promise<{ combinableRtContracts?: string[]; active?: boolean }> }).request(`/transport/${supplierId}/${ri.transportId}`).catch(() => null)
  const married = Boolean(tcIda?.combinableRtContracts?.includes(rv.transportId!))
  await log(`${label}: cargado (HUB ${idaId}/${vtaId}, TC ${ri.transportId}/${rv.transportId}${married ? ', casado' : ', SIN casar'})${m.warnings.length ? ` · ${m.warnings.join('; ')}` : ''}`)
  return { id: row.id, ok: rl.success && married, flight: label, ida: idaId, vuelta: vtaId, tc: [ri.transportId!, rv.transportId!], warnings: m.warnings, reason: married ? undefined : 'Subido a TC pero no quedó casado: revisarlo' }
}

export const operatorCuposLoadHandler: HandlerDefinition = {
  kind: 'operator_cupos.load',
  lane: 'sabre',
  flags: [FLAGS.sabreCalls, FLAGS.tcWrites],
  provider: SABRE_PROVIDER,
  description: 'Carga a la web cupos de operadores (Eurovips): verifica cada vuelo en Sabre, crea ida y vuelta en HUB y los sube a TC casados',
  handler: async ({ db, job, log, heartbeat }) => {
    const ids = ((job.payload.ids as unknown[]) ?? []).map(Number).filter(Number.isFinite)
    if (!ids.length) return { ok: false, error: 'payload.ids vacío', retry: false }
    const { data: rows, error } = await db.from('operator_cupos').select('*').in('id', ids)
    if (error) return { ok: false, error: error.message, retry: true }
    const { data: tpl } = await db.from('flights').select('*').eq('leg_type', 'outbound').eq('supplier_id', 18259).order('id', { ascending: false }).limit(1).single()
    if (!tpl) return { ok: false, error: 'No hay vuelo plantilla', retry: false }
    const shop = createSabreShopper(db, { jobId: job.id })
    const results: Result[] = []
    try {
      for (const row of (rows ?? []) as unknown as OperatorCupoRow[]) {
        await heartbeat?.()
        try { results.push(await loadOne(db, row, shop, tpl as Record<string, unknown>, m => log(m))) }
        catch (err) { results.push({ id: row.id, ok: false, reason: err instanceof Error ? err.message : String(err) }) }
      }
    } finally { await shop.close() }
    const ok = results.filter(r => r.ok).length
    await log(`Cupos de operadores: ${ok} de ${results.length} cargados a la web`, { results })
    return { ok: true, result: { loaded: ok, total: results.length, results } }
  },
}
