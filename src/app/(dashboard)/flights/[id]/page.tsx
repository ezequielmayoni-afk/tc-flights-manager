import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { FlightForm } from '@/components/flights/FlightForm'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlightWithRelations = any

async function getFlight(id: string): Promise<FlightWithRelations | null> {
  const supabase = await createClient()

  const { data: flight, error } = await supabase
    .from('flights')
    .select(`
      *,
      flight_segments(*),
      flight_datasheets(*),
      flight_cancellations(*),
      modalities(*, modality_inventories(*))
    `)
    .eq('id', id)
    .single()

  if (error || !flight) {
    return null
  }

  return flight as FlightWithRelations
}

async function getPairedFlight(pairedId: number): Promise<FlightWithRelations | null> {
  const supabase = await createClient()

  const { data: flight, error } = await supabase
    .from('flights')
    .select(`
      *,
      flight_segments(*)
    `)
    .eq('id', pairedId)
    .single()

  if (error || !flight) {
    return null
  }

  return flight as FlightWithRelations
}

async function getCatalogs() {
  const supabase = await createClient()

  const [airlinesRes, airportsRes, suppliersRes] = await Promise.all([
    supabase.from('airlines').select('code, name').order('code'),
    supabase.from('airports').select('code, name, city').order('code'),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  return {
    airlines: airlinesRes.data || [],
    airports: airportsRes.data || [],
    suppliers: suppliersRes.data || [],
  }
}

export default async function EditFlightPage({ params }: PageProps) {
  const { id } = await params
  const [flight, catalogs] = await Promise.all([
    getFlight(id),
    getCatalogs(),
  ])

  if (!flight) {
    notFound()
  }

  // Obtener vuelo pareado si existe
  const pairedFlight = flight.paired_flight_id
    ? await getPairedFlight(flight.paired_flight_id)
    : null

  // Determinar cuál es outbound y cuál es return
  const isOutbound = flight.leg_type === 'outbound'
  const outboundFlight = isOutbound ? flight : pairedFlight
  const returnFlight = isOutbound ? pairedFlight : flight

  // Función para mapear segmentos con leg_type
  const mapSegments = (segments: Array<{
    departure_location_code: string
    arrival_location_code: string
    departure_time: string
    arrival_time: string
    plus_days: number
    duration_time: string | null
    model: string | null
    num_service: string | null
    sort_order: number
    leg_type?: string
  }>, legType: 'outbound' | 'return') => segments.map(s => ({
    departure_location_code: s.departure_location_code,
    arrival_location_code: s.arrival_location_code,
    departure_time: s.departure_time,
    arrival_time: s.arrival_time,
    plus_days: s.plus_days,
    duration_time: s.duration_time || '',
    model: s.model || '',
    num_service: s.num_service || '',
    sort_order: s.sort_order,
    leg_type: legType,
  }))

  // Combinar segmentos de ambos vuelos
  const outboundSegments = outboundFlight?.flight_segments
    ? mapSegments(outboundFlight.flight_segments, 'outbound')
    : []
  const returnSegments = returnFlight?.flight_segments
    ? mapSegments(returnFlight.flight_segments, 'return')
    : []

  // Quitar sufijo -IDA o -VUELTA del base_id y name para el form
  const cleanBaseId = (flight.base_id || '').replace(/-IDA$|-VUELTA$/, '')
  const cleanName = (flight.name || '').replace(/ \(Ida\)$| \(Vuelta\)$/, '')

  // Transformar los datos para el formulario
  const formData = {
    id: flight.id,
    tc_transport_id: flight.tc_transport_id,
    paired_flight_id: flight.paired_flight_id,
    leg_type: flight.leg_type,
    supplier_id: flight.supplier_id,
    base_id: cleanBaseId,
    name: cleanName,
    airline_code: flight.airline_code,
    transport_type: flight.transport_type,
    active: flight.active,
    price_per_pax: flight.price_per_pax,
    currency: flight.currency,
    base_adult_price: Number(flight.base_adult_price),
    base_children_price: Number(flight.base_children_price),
    base_infant_price: Number(flight.base_infant_price),
    base_adult_rt_price: Number(flight.base_adult_rt_price),
    base_children_rt_price: Number(flight.base_children_rt_price),
    base_infant_rt_price: Number(flight.base_infant_rt_price),
    adult_taxes_amount: Number(flight.adult_taxes_amount),
    children_taxes_amount: Number(flight.children_taxes_amount),
    infant_taxes_amount: Number(flight.infant_taxes_amount),
    adult_rt_taxes_amount: Number(flight.adult_rt_taxes_amount),
    children_rt_taxes_amount: Number(flight.children_rt_taxes_amount),
    infant_rt_taxes_amount: Number(flight.infant_rt_taxes_amount),
    // Mapear fechas según leg_type
    outbound_date: outboundFlight?.start_date || '',
    return_date: returnFlight?.start_date || '',
    release_contract: flight.release_contract,
    // Mapear días operacionales según leg_type
    outbound_operational_days: outboundFlight?.operational_days || [],
    return_operational_days: returnFlight?.operational_days || [],
    option_codes: flight.option_codes || [],
    only_holiday_package: flight.only_holiday_package,
    show_in_transport_quotas_landing: flight.show_in_transport_quotas_landing,
    min_child_age: flight.min_child_age,
    max_child_age: flight.max_child_age,
    min_infant_age: flight.min_infant_age,
    max_infant_age: flight.max_infant_age,
    allow_ow_price: flight.allow_ow_price,
    allow_rt_price: flight.allow_rt_price,
    product_types: flight.product_types || [],
    combinable_rt_contracts: flight.combinable_rt_contracts || [],
    // Combinar segmentos de ida y vuelta
    segments: [...outboundSegments, ...returnSegments],
    datasheets: (flight.flight_datasheets || []).map((d: {
      language: string
      name: string | null
      description: string | null
    }) => ({
      language: d.language,
      name: d.name || '',
      description: d.description || '',
    })),
    cancellations: (flight.flight_cancellations || []).map((c: {
      days: number
      percentage: number
    }) => ({
      days: c.days,
      percentage: Number(c.percentage),
    })),
    // Transformar modalidad (tomar la primera si existe)
    modality: flight.modalities?.[0] ? (() => {
      const m = flight.modalities[0]
      const inv = m.modality_inventories?.[0]
      return {
        code: m.code?.replace(/-IDA$|-VUELTA$/, '') || '',
        active: m.active,
        cabin_class_type: m.cabin_class_type,
        includes_backpack: m.includes_backpack || false,
        carryon_weight: m.carryon_weight || 0,
        checked_bag_weight: m.checked_bag_weight || 0,
        checked_bags_quantity: m.checked_bags_quantity || 1,
        min_passengers: m.min_passengers || 1,
        max_passengers: m.max_passengers || 10,
        on_request: m.on_request || false,
        quantity: inv?.quantity || 0,
      }
    })() : undefined,
  }

  return (
    <div className="flex flex-col h-full">
      <Header title={`Editar: ${flight.name}`} />

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl">
          <FlightForm
            initialData={formData}
            airlines={catalogs.airlines}
            airports={catalogs.airports}
            suppliers={catalogs.suppliers}
          />
        </div>
      </div>
    </div>
  )
}
