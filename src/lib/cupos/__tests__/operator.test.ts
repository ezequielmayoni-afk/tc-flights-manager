import { describe, expect, it } from 'vitest'
import { buildOperatorView, operatorAirport, operatorRegion, type OperatorCupoRow } from '../operator'

const row = (o: Partial<OperatorCupoRow>): OperatorCupoRow => ({
  id: 1, operator: 'eurovips', departure_key: 'k', package_fare_id: 'f', fare_type: 'AEREO', origin_code: 'BUE', origin_name: 'BUENOS AIRES', destination_code: 'RIO', destination_name: 'RIO DE JANEIRO',
  departure_date: '2027-01-20', return_date: '2027-01-27', nights: 7, fixture_name: null, package_name: 'AEREO RIO', hotel_name: null, seats: 10, departure_seats: 8, seats_detail: null,
  airline_code: 'JA', airline_name: 'JETSMART', flight_out: 'JA3812', depart_out: '04:15', arrive_out: '07:10', stops_out: 0, flight_back: 'JA3815', depart_back: '20:05', arrive_back: '23:30', stops_back: 0,
  pax: 2, currency: 'USD', list_price: null, gross_amount: 1000, commission: 130, air_taxes: 100, dnt_tax: 20, fees: 10, vat: 5, land_tax_not_included: null, net_agency: 870, net_passenger: 1000, net_agency_pp: 435,
  status: 'ok', error: null, first_seen_at: '', last_seen_at: '2026-10-26T16:58:00Z', priced_at: null, ...o,
})

describe('cupos de operadores', () => {
  it('traduce ciudad a aeropuerto y región', () => {
    expect(operatorAirport('RIO')).toBe('GIG'); expect(operatorAirport('BAY')).toBe('PUJ'); expect(operatorAirport('MBJ')).toBe('MBJ')
    expect(operatorRegion('PDF')).toBe('brasil'); expect(operatorRegion('BAY')).toBe('caribe'); expect(operatorRegion('CUZ')).toBe('latam'); expect(operatorRegion('LON')).toBe('europa')
  })
  it('arma la vista con montos por persona, vendidos y nuestros cupos a ±7 días', () => {
    const [v] = buildOperatorView([row({})], {
      firstSeats: new Map([['k|f', 10]]),
      ownCupos: [{ flightId: 85, airport: 'GIG', originAirport: 'AEP', date: '2027-01-20', total: 16, remaining: 3, name: 'JA' }, { flightId: 87, airport: 'GIG', originAirport: 'AEP', date: '2027-02-13', total: 10, remaining: 8, name: 'JA' }],
    })
    expect(v).toMatchObject({ destination: 'Rio De Janeiro', region: 'brasil', seatsSold: 2, netPp: 435, grossPp: 500, commissionPp: 65, taxesPp: 67.5, airline: 'Jetsmart', direct: true })
    expect(v.own).toEqual([{ flightId: 85, date: '2027-01-20', remaining: 3, total: 16, days: 0 }])
  })
})

import { canLoad, flightFields, matchItinerary, segmentRows } from '../operator-load'
import type { BfmItinerary } from '@/lib/sabre/client'

describe('carga a la web de cupos de operador', () => {
  const base = row({ fare_type: 'AEREO', airline_code: 'LA', flight_out: '2976', flight_back: '2391', depart_out: '07:20', arrive_out: '16:15', depart_back: '17:20', stops_out: 1, stops_back: 1, departure_date: '2027-01-26', return_date: '2027-02-02', origin_code: 'BUE', destination_code: 'CTG', package_fare_id: '40075632', net_agency_pp: 819 })
  const seg = (from: string, to: string, dep: string, arr: string, fn: string) => ({ from, to, departure: dep, arrival: arr, airline: 'LA', operatingAirline: 'LA', flightNumber: fn, stops: 0 })
  const itin = (out: string, back: string): BfmItinerary => ({ totalUsd: 900, currency: 'USD', airlineCode: 'LA', airlineCodes: ['LA'], stopsOut: 1, stopsBack: 1, durationOutMin: null, durationBackMin: null, flightNumbersOut: [`LA${out}`], flightNumbersBack: [`LA${back}`], departOut: '', arriveBack: '',
    segmentsOut: [seg('EZE', 'LIM', '2027-01-26T07:20:00', '2027-01-26T10:05:00', out), seg('LIM', 'CTG', '2027-01-26T12:30:00', '2027-01-26T16:15:00', '2410')],
    segmentsBack: [seg('CTG', 'LIM', '2027-02-02T17:20:00', '2027-02-02T21:00:00', back), seg('LIM', 'EZE', '2027-02-02T23:30:00', '2027-02-03T06:20:00', '2375')] })
  it('sólo se cargan aéreos con neto, vuelo y lugares, una sola vez', () => {
    expect(canLoad(base, '2026-10-26', false)).toEqual({ ok: true })
    expect(canLoad(base, '2026-10-26', true).ok).toBe(false)
    expect(canLoad({ ...base, fare_type: 'AEROTERRESTRE' }, '2026-10-26', false).reason).toContain('hotel')
    expect(canLoad({ ...base, operator: 'otro' }, '2026-10-26', false).reason).toContain('sin proveedor')
  })
  it('elige en Sabre el itinerario con el mismo primer vuelo de ida y de vuelta', () => {
    const m = matchItinerary(base, [itin('9999', '2391'), itin('2976', '2391')])
    expect(m.itinerary?.segmentsOut?.[0].flightNumber).toBe('2976')
    expect(m.warnings).toEqual([])
    expect(matchItinerary(base, [itin('9999', '1111')]).reason).toContain('Sabre no tiene LA2976/LA2391')
  })
  it('arma ida y vuelta con el proveedor del operador, sin sólo vuelo, y tramos con días de más', () => {
    const it = itin('2976', '2391')
    const ida = flightFields(base, it, 'outbound'); const vta = flightFields(base, it, 'return')
    expect(ida).toMatchObject({ supplier_id: 19660, start_date: '2027-01-26', base_adult_rt_price: 819, operator_cupo_id: 1, source_operator: 'eurovips', name: 'EVIPS LA-EZE/CTG/EZE ENE-27' })
    expect(ida.product_types).not.toContain('ONLY_FLIGHT')
    expect(vta).toMatchObject({ start_date: '2027-02-02', leg_type: 'return' })
    expect(segmentRows(it.segmentsBack!, 'return', 'Latam').map(s => `${s.departure_location_code}${s.arrival_location_code}+${s.plus_days}`)).toEqual(['CTGLIM+0', 'LIMEZE+1'])
  })
})

import { directItineraryFromKnown, knownLeg } from '../operator-load'
describe('vuelo directo low cost sin Sabre', () => {
  it('toma los aeropuertos de nuestros cupos con el mismo número y los horarios del operador', () => {
    const segs = [{ num_service: '3832', departure_location_code: 'EZE', arrival_location_code: 'NAT' }, { num_service: '3832', departure_location_code: 'AEP', arrival_location_code: 'NAT' }, { num_service: '3832', departure_location_code: 'AEP', arrival_location_code: 'NAT' }, { num_service: '3833', departure_location_code: 'NAT', arrival_location_code: 'AEP' }]
    const r = row({ airline_code: 'WJ', flight_out: '03832', flight_back: '03833', depart_out: '04:25', arrive_out: '09:45', depart_back: '23:50', arrive_back: '04:30', stops_out: 0, stops_back: 0, departure_date: '2027-01-06', return_date: '2027-01-13', destination_code: 'NAT' })
    const it = directItineraryFromKnown(r, knownLeg(segs, '03832', 'NAT', null), knownLeg(segs, '03833', null, 'NAT'))
    expect(it?.segmentsOut?.[0]).toMatchObject({ from: 'AEP', to: 'NAT', departure: '2027-01-06T04:25:00', flightNumber: '3832' })
    expect(it?.segmentsBack?.[0].arrival).toBe('2027-01-14T04:30:00')
    expect(directItineraryFromKnown({ ...r, stops_out: 1 }, { from: 'AEP', to: 'NAT' }, { from: 'NAT', to: 'AEP' })).toBeNull()
  })
})
