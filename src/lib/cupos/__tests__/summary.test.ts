import { describe, expect, it } from 'vitest'
import { buildCupoSummary, describeAirport, destinationLabel, seatStatus } from '../summary'
import type { FlightForMatch } from '@/lib/packages/flight-match'

const flight = (over: Partial<FlightForMatch> & { id: number }): FlightForMatch => ({
  supplier_id: 1, airline_code: 'JA', base_id: null, name: 'JA-AEP/RIO/AEP', start_date: '2027-02-13', end_date: '2027-02-13', leg_type: 'outbound', paired_flight_id: null, tc_transport_id: null, active: true,
  flight_segments: [{ departure_location_code: 'AEP', arrival_location_code: 'GIG', num_service: '3812', sort_order: 1 }],
  modalities: [{ modality_inventories: [{ quantity: 10, sold: 2, remaining_seats: 8 }] }],
  ...over,
})

describe('describeAirport', () => {
  it('usa la tabla fija y cae a los perfiles', () => {
    expect(describeAirport('GIG')).toMatchObject({ name: 'Rio de Janeiro', region: 'brasil' })
    expect(describeAirport('XYZ', [{ name: 'Destino X', family: 'caribe', iata_airport: 'XYZ' }])).toMatchObject({ name: 'Destino X', region: 'caribe' })
    expect(describeAirport('QQQ')).toMatchObject({ name: 'QQQ', region: 'otros' })
  })
})

describe('destinationLabel', () => {
  it('nombre del aeropuerto en español más los destinos extra del paquete, sin repetir la misma ciudad', () => {
    expect(destinationLabel(describeAirport('GRU'), ['Sao Paulo'])).toBe('San Pablo')
    expect(destinationLabel(describeAirport('GIG'), ['Búzios', 'Rio de Janeiro'])).toBe('Rio de Janeiro + Búzios')
    expect(destinationLabel(describeAirport('REC'), ['Porto de Galinhas'])).toBe('Recife / Porto de Galinhas')
    expect(destinationLabel(describeAirport('FLN'), ['Florianopolis'])).toBe('Florianópolis')
    expect(destinationLabel(describeAirport('PUJ'), ['Bayahibe', 'Punta Cana'])).toBe('Punta Cana + Bayahibe')
  })
})

describe('seatStatus', () => {
  it('agotado, últimos (≤3), pocos (≤40 %), ok', () => {
    expect(seatStatus(0, 10)).toBe('agotado'); expect(seatStatus(3, 10)).toBe('ultimos'); expect(seatStatus(4, 10)).toBe('pocos'); expect(seatStatus(8, 10)).toBe('ok')
  })
})

describe('buildCupoSummary', () => {
  it('una fila por ida futura, con regreso del vuelo apareado y destino del paquete vinculado', () => {
    const rows = buildCupoSummary({
      flights: [
        flight({ id: 87, paired_flight_id: 88 }),
        flight({ id: 88, leg_type: 'return', start_date: '2027-02-20', flight_segments: [{ departure_location_code: 'GIG', arrival_location_code: 'AEP', num_service: '3813', sort_order: 1 }] }),
        flight({ id: 41, start_date: '2026-01-01' }), // ya salió
        flight({ id: 99, active: false }),
      ],
      linkedPackagesByFlight: new Map([[87, [5]]]), destinationsByPackage: new Map([[5, ['Búzios', 'Rio de Janeiro']]]), today: '2026-09-21',
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ flightId: 87, destination: 'Rio de Janeiro + Búzios', region: 'brasil', returnDate: '2027-02-20', remaining: 8, total: 10, status: 'ok', daysToDeparture: 145 })
  })
  it('sin paquete vinculado usa el nombre del aeropuerto y ordena por fecha', () => {
    const rows = buildCupoSummary({ flights: [flight({ id: 2, start_date: '2027-03-01' }), flight({ id: 1, start_date: '2027-01-01', flight_segments: [{ departure_location_code: 'EZE', arrival_location_code: 'PUJ', num_service: null, sort_order: 1 }] })], linkedPackagesByFlight: new Map(), destinationsByPackage: new Map(), today: '2026-09-21' })
    expect(rows.map(r => r.destination)).toEqual(['Punta Cana', 'Rio de Janeiro'])
    expect(rows[0].region).toBe('caribe')
  })
})
