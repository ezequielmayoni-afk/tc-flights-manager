import { describeAirport, type CupoRegion, type ProfileForRegion } from './summary'

/**
 * Cupos de operadores mayoristas (no nuestros). Hoy Eurovips iConnect: invoice-bot
 * (src/eurovips-cupos) llena `operator_cupos` una vez por día, una fila por tarifa de
 * cada salida, con cupos y neto. HUB sólo los lee para comparar con los propios. Puro.
 */

/** El operador usa códigos de ciudad; HUB agrupa por aeropuerto de llegada. */
export const OPERATOR_CITY_TO_AIRPORT: Record<string, string> = {
  RIO: 'GIG', SAO: 'GRU', BUE: 'EZE', LON: 'LHR', PAR: 'CDG', ROM: 'FCO', NYC: 'JFK', TYO: 'NRT', MIL: 'MXP',
  BAY: 'PUJ',            // Bayahibe vuela a Punta Cana
  IMB: 'SSA', PDF: 'SSA', // Imbassaí y Praia do Forte vuelan a Salvador
  RMY: 'CUN',            // Riviera Maya vuela a Cancún
}

const LATAM: Record<string, string> = { CUZ: 'Cusco', BOG: 'Bogotá', GUA: 'Guatemala', UIO: 'Quito', LIM: 'Lima', SCL: 'Santiago de Chile', MVD: 'Montevideo' }

export function operatorAirport(cityCode: string): string {
  const c = (cityCode || '').toUpperCase()
  return OPERATOR_CITY_TO_AIRPORT[c] ?? c
}

export type OperatorRegion = CupoRegion | 'latam'
export const OPERATOR_REGION_LABELS: Record<OperatorRegion, string> = {
  brasil: 'Brasil', caribe: 'Caribe', europa: 'Europa', medio_oriente_asia: 'Medio Oriente y Asia', usa: 'Estados Unidos', argentina: 'Argentina', latam: 'Latinoamérica', otros: 'Otros',
}

export function operatorRegion(cityCode: string, profiles: ProfileForRegion[] = []): OperatorRegion {
  const c = (cityCode || '').toUpperCase()
  if (LATAM[c]) return 'latam'
  return describeAirport(operatorAirport(c), profiles).region
}

const title = (s: string | null) => (s ?? '').toLowerCase().replace(/(^|\s|-|\/)(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase())

export interface OperatorCupoRow {
  id: number; operator: string; departure_key: string; package_fare_id: string; fare_type: string
  origin_code: string; origin_name: string | null; destination_code: string; destination_name: string | null
  departure_date: string; return_date: string | null; nights: number | null; fixture_name: string | null; package_name: string | null; hotel_name: string | null
  seats: number | null; departure_seats: number; seats_detail: string | null
  airline_code: string | null; airline_name: string | null; flight_out: string | null; budget_number?: string | null; depart_out: string | null; arrive_out: string | null; stops_out: number | null
  flight_back: string | null; depart_back: string | null; arrive_back: string | null; stops_back: number | null
  pax: number; currency: string; list_price: number | string | null; gross_amount: number | string | null; commission: number | string | null; air_taxes: number | string | null
  dnt_tax: number | string | null; fees: number | string | null; vat: number | string | null; land_tax_not_included: number | string | null
  net_agency: number | string | null; net_passenger: number | string | null; net_agency_pp: number | string | null
  status: string; error: string | null; first_seen_at: string; last_seen_at: string; priced_at: string | null
}

export interface OwnCupo { flightId: number; airport: string; originAirport: string | null; date: string; total: number; remaining: number; name: string }

export interface OperatorCupoView {
  id: number; fareType: string; region: OperatorRegion; origin: string; destination: string; destinationCode: string
  departureDate: string; returnDate: string | null; nights: number | null; name: string; hotel: string | null
  seats: number | null; departureSeats: number; seatsDetail: string | null; seatsSold: number | null
  airline: string | null; flights: string; schedule: string; direct: boolean | null
  currency: string; netPp: number | null; salePp: number | null; grossPp: number | null; commissionPp: number | null; taxesPp: number | null; landTaxPp: number | null
  status: string; error: string | null; lastSeenAt: string
  own: Array<{ flightId: number; date: string; remaining: number; total: number; days: number }>
  operator: string; operatorLabel: string
  /** Carga a la web: si se puede, por qué no, y el vuelo de HUB si ya se cargó. */
  loadable?: boolean; loadReason?: string | null; loadedFlightId?: number | null
}

export const OPERATOR_LABELS: Record<string, string> = { eurovips: 'Eurovips' }
export const operatorLabel = (op: string) => OPERATOR_LABELS[op] ?? op.charAt(0).toUpperCase() + op.slice(1)

const num = (v: number | string | null | undefined) => (v === null || v === undefined || v === '' ? null : Number(v))
const pp = (v: number | string | null, pax: number) => { const n = num(v); return n === null || !pax ? null : Math.round((n / pax) * 100) / 100 }
const dayDiff = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)

/**
 * Arma la vista: región, nombre legible, horarios, montos por persona, cuántos lugares
 * vendió el operador desde la primera foto y nuestros cupos al mismo aeropuerto a ±7 días.
 */
export function buildOperatorView(rows: OperatorCupoRow[], opts: { firstSeats?: Map<string, number>; ownCupos?: OwnCupo[]; profiles?: ProfileForRegion[] } = {}): OperatorCupoView[] {
  const own = opts.ownCupos ?? []
  return rows.map(r => {
    const airport = operatorAirport(r.destination_code)
    const first = opts.firstSeats?.get(`${r.departure_key}|${r.package_fare_id}`)
    const flights = [r.flight_out, r.flight_back].filter(Boolean).join(' / ')
    const schedule = [r.depart_out && `${r.depart_out}${r.arrive_out ? `→${r.arrive_out}` : ''}`, r.depart_back && `${r.depart_back}${r.arrive_back ? `→${r.arrive_back}` : ''}`].filter(Boolean).join(' · ')
    const stops = [r.stops_out, r.stops_back].filter((x): x is number => x !== null && x !== undefined)
    const taxes = [r.air_taxes, r.dnt_tax, r.fees, r.vat].map(num).filter((x): x is number => x !== null)
    return {
      id: r.id, operator: r.operator, operatorLabel: operatorLabel(r.operator), fareType: r.fare_type, region: operatorRegion(r.destination_code, opts.profiles),
      origin: title(r.origin_name) || r.origin_code, destination: title(r.destination_name) || r.destination_code, destinationCode: r.destination_code,
      departureDate: r.departure_date, returnDate: r.return_date, nights: r.nights,
      name: r.package_name || r.fixture_name || '', hotel: r.hotel_name ? title(r.hotel_name) : null,
      seats: r.seats, departureSeats: r.departure_seats, seatsDetail: r.seats_detail,
      seatsSold: first !== undefined && first >= r.departure_seats ? first - r.departure_seats : null,
      airline: r.airline_name ? title(r.airline_name) : null, flights, schedule, direct: stops.length ? stops.every(s => s === 0) : null,
      currency: r.currency, netPp: num(r.net_agency_pp) ?? pp(r.net_agency, r.pax), salePp: pp(r.net_passenger, r.pax), grossPp: pp(r.gross_amount, r.pax), commissionPp: pp(r.commission, r.pax),
      taxesPp: taxes.length ? pp(taxes.reduce((a, b) => a + b, 0), r.pax) : null, landTaxPp: pp(r.land_tax_not_included, r.pax),
      status: r.status, error: r.error, lastSeenAt: r.last_seen_at,
      own: own.filter(o => o.airport === airport && Math.abs(dayDiff(o.date, r.departure_date)) <= 7)
        .map(o => ({ flightId: o.flightId, date: o.date, remaining: o.remaining, total: o.total, days: dayDiff(o.date, r.departure_date) }))
        .sort((a, b) => Math.abs(a.days) - Math.abs(b.days)),
    }
  }).sort((a, b) => a.departureDate.localeCompare(b.departureDate) || a.destination.localeCompare(b.destination))
}
