import { describe, expect, it } from 'vitest'
import { buildFlightMatchIndex, matchTransport, normalizeFlightNumber, type FlightForMatch } from '../flight-match'

describe('normalizeFlightNumber', () => {
  it('saca la aerolínea y los ceros a la izquierda', () => {
    expect(normalizeFlightNumber('AR 0502')).toBe('502')
    expect(normalizeFlightNumber('AR502')).toBe('502')
    expect(normalizeFlightNumber('0502')).toBe('502')
    expect(normalizeFlightNumber('502')).toBe('502')
  })

  it('rechaza lo que no es un número de vuelo', () => {
    expect(normalizeFlightNumber(null)).toBeNull()
    expect(normalizeFlightNumber('')).toBeNull()
    expect(normalizeFlightNumber('ABCD 12')).toBeNull()
    expect(normalizeFlightNumber('AR 123456')).toBeNull()
  })
})

const cupo: FlightForMatch = {
  id: 581, supplier_id: 1, airline_code: 'DM', base_id: '581-IDA', name: 'Cupo Punta Cana', start_date: '2027-01-12', end_date: '2027-01-12',
  leg_type: 'outbound', paired_flight_id: 582, tc_transport_id: null, active: true,
  flight_segments: [{ departure_location_code: 'EZE', arrival_location_code: 'PUJ', num_service: '6267' }],
  modalities: [{ modality_inventories: [{ quantity: 16, sold: 16, remaining_seats: 0 }] }],
}
const transport = { marketing_airline_code: 'DM', origin_code: 'EZE', destination_code: 'PUJ', departure_date: '2027-01-12', transport_number: 'DM6267' }

describe('matchTransport y el proveedor del transporte', () => {
  const index = buildFlightMatchIndex([cupo])
  it('un transporte de contrato (con proveedor) se vincula al cupo', () => {
    expect(matchTransport(index, { ...transport, supplier_name: 'Sí, viajo' })?.flightId).toBe(581)
  })
  it('una tarifa de sistema (sin proveedor) NO se vincula aunque sea el mismo vuelo en la misma fecha', () => {
    expect(matchTransport(index, { ...transport, supplier_name: null })).toBeNull()
  })
  it('si el consumidor no cargó la columna, se matchea como siempre', () => {
    expect(matchTransport(index, transport)?.flightId).toBe(581)
  })
})
