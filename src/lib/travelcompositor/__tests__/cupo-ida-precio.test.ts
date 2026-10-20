import { describe, expect, it } from 'vitest'
import { mapFlightToTransport, type DBFlight } from '../mapper'

const base = {
  id: 1, base_id: 'X', tc_transport_id: 'TRANSPORT-1', name: 'JA-EZE/MCZ/EZE', airline_code: 'JA', transport_type: 'PLANE', active: true, price_per_pax: true, currency: 'USD',
  base_adult_price: 0, base_children_price: 0, base_infant_price: 0, base_adult_rt_price: 641, base_children_rt_price: 641, base_infant_rt_price: 641,
  adult_taxes_amount: 0, children_taxes_amount: 0, infant_taxes_amount: 0, adult_rt_taxes_amount: 0, children_rt_taxes_amount: 0, infant_rt_taxes_amount: 0,
  start_date: '2027-01-28', end_date: '2027-01-28', release_contract: 40, operational_days: ['THURSDAY'], option_codes: [], only_holiday_package: false, show_in_transport_quotas_landing: true,
  min_child_age: 2, max_child_age: 11, min_infant_age: 0, max_infant_age: 2, allow_ow_price: false, allow_rt_price: true, product_types: ['ONLY_FLIGHT'], combinable_rt_contracts: ['TRANSPORT-2'],
  flight_segments: [{ departure_location_code: 'EZE', arrival_location_code: 'MCZ', departure_time: '05:30:00', arrival_time: '11:00:00', plus_days: 0, duration_time: '05:30:00', model: 'Jetsmart', num_service: '3840', sort_order: 0 }],
  flight_datasheets: [], flight_cancellations: [], modalities: [],
} as unknown as DBFlight

describe('cupo ida/vuelta en TC', () => {
  it('la ida casada lleva precio sólo ida = precio del cupo y venta sólo ida encendida', () => {
    const t = mapFlightToTransport({ ...base, leg_type: 'outbound', paired_flight_id: 2 } as DBFlight)
    expect(t).toMatchObject({ allowOWPrice: true, baseAdultPrice: 641, baseChildrenPrice: 641, baseInfantPrice: 641, baseAdultRTPrice: 641, combinableRtContracts: ['TRANSPORT-2'] })
  })
  it('la vuelta queda como siempre y sin combinables (casado de un solo lado)', () => {
    const t = mapFlightToTransport({ ...base, leg_type: 'return', paired_flight_id: 1 } as DBFlight)
    expect(t).toMatchObject({ allowOWPrice: false, baseAdultPrice: 0, combinableRtContracts: [] })
  })
  it('un vuelo sin vuelta casada no cambia', () => {
    const t = mapFlightToTransport({ ...base, leg_type: 'outbound', paired_flight_id: null, combinable_rt_contracts: [] } as DBFlight)
    expect(t).toMatchObject({ allowOWPrice: false, baseAdultPrice: 0 })
  })
  it('si la ida ya tiene un precio sólo ida propio, se respeta', () => {
    const t = mapFlightToTransport({ ...base, leg_type: 'outbound', paired_flight_id: 2, base_adult_price: 700 } as DBFlight)
    expect(t.baseAdultPrice).toBe(700)
  })
})
