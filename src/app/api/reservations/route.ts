import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Cliente sin tipos para tablas no tipadas
function getUntypedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  const supabase = getUntypedClient()
  const searchParams = request.nextUrl.searchParams

  // Filters
  const status = searchParams.get('status')
  const flightId = searchParams.get('flight_id')
  const startDate = searchParams.get('start_date')
  const endDate = searchParams.get('end_date')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = supabase
    .from('reservations')
    .select(`
      *,
      flights (
        id,
        name,
        airline_code,
        start_date,
        end_date,
        supplier_id
      )
    `, { count: 'exact' })
    .order('reservation_date', { ascending: false })
    .range(offset, offset + limit - 1)

  // Apply filters
  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (flightId) {
    query = query.eq('flight_id', parseInt(flightId))
  }

  if (startDate) {
    query = query.gte('reservation_date', startDate)
  }

  if (endDate) {
    query = query.lte('reservation_date', `${endDate}T23:59:59`)
  }

  if (search) {
    query = query.or(`booking_reference.ilike.%${search}%,tc_service_id.ilike.%${search}%`)
  }

  const { data: reservations, error, count } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reservations, total: count })
}

// Manual reservation creation (for testing or manual entry)
export async function POST(request: NextRequest) {
  const supabase = getUntypedClient()
  const body = await request.json()

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      booking_reference: body.booking_reference,
      tc_service_id: body.tc_service_id || body.booking_reference,
      tc_transport_id: body.tc_transport_id,
      provider: body.provider || 'MANUAL',
      provider_description: body.provider_description || 'Manual Entry',
      flight_id: body.flight_id,
      status: body.status || 'confirmed',
      adults: body.adults || 0,
      children: body.children || 0,
      infants: body.infants || 0,
      total_amount: body.total_amount,
      currency: body.currency || 'USD',
      travel_date: body.travel_date,
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update inventory if flight_id is provided
  if (body.flight_id) {
    const totalPassengers = (body.adults || 0) + (body.children || 0) + (body.infants || 0)

    // Get modality inventory
    const { data: modalities } = await supabase
      .from('modalities')
      .select('id, modality_inventories(id, sold)')
      .eq('flight_id', body.flight_id)
      .limit(1)

    if (modalities && modalities.length > 0) {
      const inventory = modalities[0].modality_inventories?.[0]
      if (inventory) {
        await supabase
          .from('modality_inventories')
          .update({ sold: (inventory.sold || 0) + totalPassengers })
          .eq('id', inventory.id)
      }
    }
  }

  return NextResponse.json(data)
}
