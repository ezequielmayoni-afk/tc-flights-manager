import { createAdminClient } from '@/lib/supabase/admin'
import type { FlightFormData } from '@/lib/validations/flight'
import { loadRequest } from './requests'

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const hhmm = (t: string | null) => { const m = (t ?? '').match(/(\d{1,2}):(\d{2})/); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '08:00' }
const iata = (code: string) => code.replace(/-.*$/, '').toUpperCase().slice(0, 3)

/** Prellena el alta de vuelos (ida + vuelta) con una tirada aceptada del pedido de cupos. */
export async function flightPrefillFromOption(optionId: number, suppliers: Array<{ id: number; name: string }>): Promise<{ requestId: number; summary: string; initialData: FlightFormData } | null> {
  const db = createAdminClient()
  const { data: opt } = await db.from('cupo_request_options').select('*').eq('id', optionId).maybeSingle()
  if (!opt) return null
  const loaded = await loadRequest(db, Number(opt.request_id))
  if (!loaded) return null
  const r = loaded.request
  const supplier = suppliers.find(s => /s[ií],? ?viajo/i.test(s.name)) ?? suppliers[0]
  const origin = iata(r.origin_code === 'BUE' ? 'EZE' : r.origin_code)
  const dest = iata(r.destination_code)
  const airlineCode = String(opt.airline_code ?? (opt.flight_out ?? '').slice(0, 2)).toUpperCase().slice(0, 3) || 'XX'
  const dep = String(opt.departure_date)
  const month = MONTHS[Number(dep.slice(5, 7)) - 1]
  const salePrice = opt.system_price_pp ? Math.round(Number(opt.system_price_pp)) : 0
  const initialData: FlightFormData = {
    supplier_id: supplier?.id ?? 1,
    base_id: `${airlineCode}-${origin}/${dest}/${origin} ${month}-${dep.slice(2, 4)}`,
    name: `${airlineCode}-${origin}/${dest}/${origin} ${month} ${dep.slice(0, 4)}`,
    airline_code: airlineCode, transport_type: 'PLANE', active: true, price_per_pax: true, currency: String(opt.system_currency ?? 'USD'),
    base_adult_price: 0, base_children_price: 0, base_infant_price: 0,
    base_adult_rt_price: salePrice, base_children_rt_price: salePrice, base_infant_rt_price: 0,
    adult_taxes_amount: 0, children_taxes_amount: 0, infant_taxes_amount: 0, adult_rt_taxes_amount: 0, children_rt_taxes_amount: 0, infant_rt_taxes_amount: 0,
    outbound_date: dep, return_date: String(opt.return_date), release_contract: 0, outbound_operational_days: [], return_operational_days: [], option_codes: [],
    only_holiday_package: false, show_in_transport_quotas_landing: true, min_child_age: 2, max_child_age: 11, min_infant_age: 0, max_infant_age: 2, allow_ow_price: false, allow_rt_price: true,
    product_types: ['ONLY_FLIGHT', 'FLIGHT_HOTEL', 'MULTI', 'MAGIC_BOX', 'ROUTING'], combinable_rt_contracts: [],
    segments: [
      { departure_location_code: origin, arrival_location_code: dest, departure_time: hhmm(opt.depart_out), arrival_time: hhmm(opt.arrive_out), plus_days: 0, num_service: String(opt.flight_out ?? '').replace(/^[A-Za-z]{2}/, ''), sort_order: 0, leg_type: 'outbound' },
      { departure_location_code: dest, arrival_location_code: origin, departure_time: hhmm(opt.depart_back), arrival_time: hhmm(opt.arrive_back), plus_days: 0, num_service: String(opt.flight_back ?? '').replace(/^[A-Za-z]{2}/, ''), sort_order: 0, leg_type: 'return' },
    ],
    datasheets: [], cancellations: [],
    modality: { code: 'MOD-01', active: true, cabin_class_type: 'ECONOMY', includes_backpack: true, carryon_weight: 8, checked_bag_weight: opt.checked_bag ? 23 : 0, checked_bags_quantity: opt.checked_bag ? 1 : 0, min_passengers: 1, max_passengers: 10, on_request: false, quantity: Number(opt.seats), sold: 0 },
  }
  const summary = `${r.origin_code} → ${r.destination_name}, ${dep} a ${opt.return_date}, ${opt.airline ?? airlineCode} ${[opt.flight_out, opt.flight_back].filter(Boolean).join('/')}, ${opt.seats} lugares${opt.airline_price_pp ? `, costo USD ${Math.round(Number(opt.airline_price_pp))} por plaza` : ''}`
  return { requestId: r.id, summary, initialData }
}
