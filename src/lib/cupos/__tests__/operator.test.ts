import { describe, expect, it } from 'vitest'
import { buildOperatorView, operatorAirport, operatorRegion, type OperatorCupoRow } from '../operator'

const row = (o: Partial<OperatorCupoRow>): OperatorCupoRow => ({
  id: 1, operator: 'eurovips', departure_key: 'k', package_fare_id: 'f', fare_type: 'AEREO', origin_code: 'BUE', origin_name: 'BUENOS AIRES', destination_code: 'RIO', destination_name: 'RIO DE JANEIRO',
  departure_date: '2027-01-20', return_date: '2027-01-27', nights: 7, fixture_name: null, package_name: 'AEREO RIO', hotel_name: null, seats: 10, departure_seats: 8, seats_detail: null,
  airline_name: 'JETSMART', flight_out: 'JA3812', depart_out: '04:15', arrive_out: '07:10', stops_out: 0, flight_back: 'JA3815', depart_back: '20:05', arrive_back: '23:30', stops_back: 0,
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
