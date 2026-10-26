import type { BfmItinerary, BfmSegment } from '@/lib/sabre/client'
import { operatorAirport, type OperatorCupoRow } from './operator'

/**
 * Carga a la web (HUB + TC) de cupos de operadores mayoristas.
 *
 * El operador da ciudad (BUE), número del primer vuelo, horarios y cantidad de
 * escalas, pero no aeropuertos ni el vuelo de la conexión. Para que el cupo quede
 * igual al del operador, cada tarifa se verifica en Sabre (misma aerolínea, número
 * de vuelo y fechas) y los tramos salen de ahí. Puro: el handler hace Sabre, base y TC.
 */

/** Operador → proveedor en TC/HUB (`suppliers.id`). */
export const OPERATOR_SUPPLIERS: Record<string, { supplierId: number; label: string; prefix: string }> = {
  eurovips: { supplierId: 19660, label: 'Eurovips', prefix: 'EVIPS' },
}

/**
 * Productos en los que se vende el cupo del operador. Sin ONLY_FLIGHT: los aéreos de
 * Eurovips dicen "SOLO AÉREO PARA VENTA EXCLUSIVA CON SERVICIOS TERRESTRES".
 */
export const OPERATOR_PRODUCT_TYPES = ['FLIGHT_HOTEL', 'MULTI', 'MAGIC_BOX', 'ROUTING']
/** Días antes de la salida en que TC deja de venderlo (el operador no informa su release). */
export const OPERATOR_RELEASE_DAYS = 7

export interface LoadCheck { ok: boolean; reason?: string }

/** ¿Se puede cargar esta tarifa a la web? */
export function canLoad(r: Pick<OperatorCupoRow, 'operator' | 'fare_type' | 'status' | 'departure_seats' | 'seats' | 'flight_out' | 'airline_code' | 'net_agency_pp' | 'return_date' | 'departure_date'>, today: string, alreadyLoaded: boolean): LoadCheck {
  if (alreadyLoaded) return { ok: false, reason: 'Ya está cargado' }
  if (!OPERATOR_SUPPLIERS[r.operator]) return { ok: false, reason: `Operador ${r.operator} sin proveedor en TC` }
  if (r.fare_type !== 'AEREO') return { ok: false, reason: r.fare_type === 'GRUPAL' ? 'Grupal: el precio incluye el terrestre' : 'Aéreo + hotel: el precio incluye el hotel y no se puede separar el aéreo' }
  if (r.status !== 'ok' || r.net_agency_pp === null) return { ok: false, reason: 'Sin neto: la lectura del operador falló' }
  if (!r.flight_out || !r.airline_code) return { ok: false, reason: 'Sin número de vuelo' }
  if (!r.return_date) return { ok: false, reason: 'Sin fecha de vuelta' }
  if ((r.seats ?? r.departure_seats) <= 0) return { ok: false, reason: 'Sin lugares' }
  if (r.departure_date <= today) return { ok: false, reason: 'Ya salió' }
  return { ok: true }
}

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^0+/, '')
const hhmm = (iso: string) => iso.slice(11, 16)
const pad = (t: string | null) => { const m = /^(\d{1,2}):(\d{2})/.exec(t ?? ''); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : null }

export interface ItineraryMatch { itinerary: BfmItinerary | null; warnings: string[]; reason?: string }

/** Busca en Sabre el itinerario del operador: misma aerolínea y número del primer vuelo de ida (y de vuelta si lo informa). */
export function matchItinerary(r: Pick<OperatorCupoRow, 'airline_code' | 'flight_out' | 'flight_back' | 'depart_out' | 'arrive_out' | 'depart_back' | 'arrive_back' | 'stops_out' | 'stops_back' | 'departure_date' | 'return_date'>, itineraries: BfmItinerary[]): ItineraryMatch {
  const al = (r.airline_code ?? '').toUpperCase()
  const out = digits(r.flight_out), back = digits(r.flight_back)
  const first = (segs?: BfmSegment[]) => segs?.[0]
  const cands = itineraries.filter(it => {
    const o = first(it.segmentsOut), b = first(it.segmentsBack)
    if (!o || o.airline?.toUpperCase() !== al || digits(o.flightNumber) !== out || o.departure.slice(0, 10) !== r.departure_date) return false
    if (back && (!b || digits(b.flightNumber) !== back)) return false
    if (r.return_date && b && b.departure.slice(0, 10) !== r.return_date) return false
    return true
  })
  if (cands.length === 0) {
    const seen = [...new Set(itineraries.map(it => it.flightNumbersOut[0]).filter(Boolean))].slice(0, 6).join(', ')
    return { itinerary: null, warnings: [], reason: `Sabre no tiene ${al}${out}${back ? `/${al}${back}` : ''} para esas fechas${seen ? ` (vio: ${seen})` : ''}` }
  }
  // Si hay varias (mismo primer vuelo, distintas conexiones), la que coincide en escalas y horarios.
  const last = (segs?: BfmSegment[]) => segs?.[segs.length - 1]
  const score = (it: BfmItinerary) => (it.stopsOut === (r.stops_out ?? it.stopsOut) ? 0 : 2) + (it.stopsBack === (r.stops_back ?? it.stopsBack) ? 0 : 2)
    + (hhmm(it.segmentsOut![0].departure) === pad(r.depart_out) ? 0 : 1) + (pad(r.arrive_out) && hhmm(last(it.segmentsOut)!.arrival) === pad(r.arrive_out) ? 0 : 1)
    + (pad(r.arrive_back) && last(it.segmentsBack) && hhmm(last(it.segmentsBack)!.arrival) === pad(r.arrive_back) ? 0 : 1)
  const it = [...cands].sort((a, b) => score(a) - score(b))[0]
  const warnings: string[] = []
  const so = it.segmentsOut!, sb = it.segmentsBack ?? []
  if (pad(r.depart_out) && hhmm(so[0].departure) !== pad(r.depart_out)) warnings.push(`sale ${hhmm(so[0].departure)} en Sabre y ${pad(r.depart_out)} en el operador`)
  if (pad(r.arrive_out) && hhmm(so[so.length - 1].arrival) !== pad(r.arrive_out)) warnings.push(`llega ${hhmm(so[so.length - 1].arrival)} en Sabre y ${pad(r.arrive_out)} en el operador`)
  if (sb.length && pad(r.depart_back) && hhmm(sb[0].departure) !== pad(r.depart_back)) warnings.push(`la vuelta sale ${hhmm(sb[0].departure)} en Sabre y ${pad(r.depart_back)} en el operador`)
  if (r.stops_out !== null && r.stops_out !== undefined && it.stopsOut !== r.stops_out) warnings.push(`ida con ${it.stopsOut} escala(s) en Sabre y ${r.stops_out} en el operador`)
  return { itinerary: it, warnings }
}

/** Destino para buscar en Sabre: código de ciudad o aeropuerto que Sabre conoce. */
export const sabreDestination = (cityCode: string) => operatorAirport(cityCode)

const DAYS = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
const MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

export interface SegmentRow { departure_location_code: string; arrival_location_code: string; departure_time: string; arrival_time: string; plus_days: number; duration_time: null; model: string; num_service: string; sort_order: number; leg_type: 'outbound' | 'return' }

export function segmentRows(segs: BfmSegment[], leg: 'outbound' | 'return', airlineName: string | null): SegmentRow[] {
  return segs.map((s, i) => ({
    departure_location_code: s.from, arrival_location_code: s.to,
    departure_time: `${s.departure.slice(11, 16)}:00`, arrival_time: `${s.arrival.slice(11, 16)}:00`,
    plus_days: Math.max(0, Math.round((Date.parse(`${s.arrival.slice(0, 10)}T00:00:00Z`) - Date.parse(`${s.departure.slice(0, 10)}T00:00:00Z`)) / 86400000)),
    duration_time: null, model: airlineName ?? s.airline ?? '', num_service: s.flightNumber, sort_order: i, leg_type: leg,
  }))
}

/** Campos propios de cada pierna (ida y vuelta) del cupo del operador; el resto sale de la plantilla. */
export function flightFields(r: OperatorCupoRow, itin: BfmItinerary, leg: 'outbound' | 'return') {
  const op = OPERATOR_SUPPLIERS[r.operator]
  const so = itin.segmentsOut!, sb = itin.segmentsBack ?? []
  const date = leg === 'outbound' ? r.departure_date : (sb[0]?.departure.slice(0, 10) ?? r.return_date!)
  const from = so[0].from, to = so[so.length - 1].to
  const ymd = r.departure_date.replace(/-/g, '')
  const net = Math.round(Number(r.net_agency_pp) * 100) / 100
  const mon = `${MES[Number(r.departure_date.slice(5, 7)) - 1]}-${r.departure_date.slice(2, 4)}`
  return {
    base_id: `${op.prefix}-${r.airline_code}-${from}-${to}-${ymd}-${r.package_fare_id || r.id}-${leg === 'outbound' ? 'IDA' : 'VUELTA'}`,
    name: leg === 'outbound' ? `${op.prefix} ${r.airline_code}-${from}/${to}/${from} ${mon}` : `${op.prefix} ${from}-${to} ${mon} (Vuelta)`,
    airline_code: (r.airline_code ?? '').toUpperCase(), supplier_id: op.supplierId, leg_type: leg, active: true,
    start_date: date, end_date: date, operational_days: [DAYS[new Date(`${date}T12:00:00Z`).getUTCDay()]],
    price_per_pax: true, currency: r.currency || 'USD',
    base_adult_price: 0, base_children_price: 0, base_infant_price: 0, base_adult_rt_price: net, base_children_rt_price: net, base_infant_rt_price: net,
    adult_taxes_amount: 0, children_taxes_amount: 0, infant_taxes_amount: 0, adult_rt_taxes_amount: 0, children_rt_taxes_amount: 0, infant_rt_taxes_amount: 0,
    allow_ow_price: false, allow_rt_price: true, product_types: OPERATOR_PRODUCT_TYPES, release_contract: OPERATOR_RELEASE_DAYS,
    option_codes: [`${op.prefix}-${r.package_fare_id || r.id}`], combinable_rt_contracts: [], tc_transport_id: null, paired_flight_id: null,
    cost_per_seat: net, cost_currency: r.currency || 'USD', source_operator: r.operator, operator_cupo_id: r.id,
    payment_conditions: `Cupo de ${op.label} (tarifa ${r.package_fare_id}${r.budget_number ? `, presupuesto ${r.budget_number}` : ''}): neto agencia USD ${net} por persona ida y vuelta (comisión y tasas incluidas según el desglose del operador). Vuelos verificados en Sabre.`,
  }
}

export function inventorySeats(r: Pick<OperatorCupoRow, 'seats' | 'departure_seats'>): number {
  return Math.max(0, r.seats ?? r.departure_seats)
}

const addDay = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10)

/**
 * Vuelos directos que Sabre no tiene (low cost: JetSMART…): los aeropuertos salen de nuestros
 * propios cupos con el mismo número de vuelo y los horarios, del operador. null si falta algo.
 */
export function directItineraryFromKnown(r: Pick<OperatorCupoRow, 'airline_code' | 'flight_out' | 'flight_back' | 'depart_out' | 'arrive_out' | 'depart_back' | 'arrive_back' | 'stops_out' | 'stops_back' | 'departure_date' | 'return_date'>, out: { from: string; to: string } | null, back: { from: string; to: string } | null): BfmItinerary | null {
  if ((r.stops_out ?? 0) !== 0 || (r.stops_back ?? 0) !== 0 || !out || !back || !r.return_date) return null
  const dO = pad(r.depart_out), aO = pad(r.arrive_out), dB = pad(r.depart_back), aB = pad(r.arrive_back)
  if (!dO || !aO || !dB || !aB) return null
  const al = (r.airline_code ?? '').toUpperCase()
  const seg = (from: string, to: string, date: string, dep: string, arr: string, fn: string): BfmSegment => ({ from, to, departure: `${date}T${dep}:00`, arrival: `${arr < dep ? addDay(date, 1) : date}T${arr}:00`, airline: al, operatingAirline: al, flightNumber: digits(fn), stops: 0 })
  const so = [seg(out.from, out.to, r.departure_date, dO, aO, r.flight_out ?? '')], sb = [seg(back.from, back.to, r.return_date, dB, aB, r.flight_back ?? '')]
  return { totalUsd: 0, currency: 'USD', airlineCode: al, airlineCodes: [al], stopsOut: 0, stopsBack: 0, durationOutMin: null, durationBackMin: null, flightNumbersOut: [`${al}${digits(r.flight_out)}`], flightNumbersBack: [`${al}${digits(r.flight_back)}`], departOut: so[0].departure, arriveBack: sb[0].arrival, segmentsOut: so, segmentsBack: sb }
}

/** Aeropuertos de un vuelo directo según nuestros cupos (mismo número de vuelo y destino): el par más cargado. */
export function knownLeg(segments: Array<{ num_service: string | null; departure_location_code: string; arrival_location_code: string }>, flight: string | null, toAirport: string | null, fromAirport: string | null): { from: string; to: string } | null {
  const fn = digits(flight)
  if (!fn) return null
  const counts = new Map<string, number>()
  for (const s of segments) {
    if (digits(s.num_service) !== fn || (toAirport && s.arrival_location_code !== toAirport) || (fromAirport && s.departure_location_code !== fromAirport)) continue
    const k = `${s.departure_location_code}-${s.arrival_location_code}`
    counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]
  if (!best) return null
  const [from, to] = best[0].split('-')
  return { from, to }
}
