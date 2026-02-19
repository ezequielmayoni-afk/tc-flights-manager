import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

interface RouteParams {
  params: Promise<{ id: string }>
}

// Cliente sin tipos para tablas no tipadas

// GET single reservation
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  const { data: reservation, error } = await supabase
    .from('reservations')
    .select(`
      *,
      flights (
        id,
        name,
        airline_code,
        start_date,
        end_date,
        flight_segments (*)
      )
    `)
    .eq('id', id)
    .single()

  if (error) {
    return errorResponse(error)
  }

  return NextResponse.json(reservation)
}

// PUT - Update reservation (modify)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()
  const body = await request.json()

  // Get existing reservation to calculate passenger delta
  const { data: existing } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  // Calculate passenger difference
  const oldTotal = (existing.adults || 0) + (existing.children || 0) + (existing.infants || 0)
  const newTotal = (body.adults || existing.adults || 0) +
                   (body.children || existing.children || 0) +
                   (body.infants || existing.infants || 0)
  const passengersDelta = newTotal - oldTotal

  // Update reservation
  const { data: reservation, error } = await supabase
    .from('reservations')
    .update({
      status: body.status || existing.status,
      adults: body.adults ?? existing.adults,
      children: body.children ?? existing.children,
      infants: body.infants ?? existing.infants,
      total_amount: body.total_amount ?? existing.total_amount,
      travel_date: body.travel_date ?? existing.travel_date,
      modification_date: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return errorResponse(error)
  }

  // Update inventory if there's a passenger change
  if (existing.flight_id && passengersDelta !== 0) {
    const { data: modalities } = await supabase
      .from('modalities')
      .select('id, modality_inventories(id, sold)')
      .eq('flight_id', existing.flight_id)
      .limit(1)

    if (modalities && modalities.length > 0) {
      const inventory = modalities[0].modality_inventories?.[0]
      if (inventory) {
        await supabase
          .from('modality_inventories')
          .update({ sold: Math.max(0, (inventory.sold || 0) + passengersDelta) })
          .eq('id', inventory.id)
      }
    }
  }

  return NextResponse.json(reservation)
}

// DELETE - Cancel reservation
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const supabase = createAdminClient()

  // Get existing reservation
  const { data: existing } = await supabase
    .from('reservations')
    .select('*')
    .eq('id', id)
    .single()

  if (!existing) {
    return NextResponse.json({ error: 'Reservation not found' }, { status: 404 })
  }

  if (existing.status === 'cancelled') {
    return NextResponse.json({ error: 'Reservation already cancelled' }, { status: 400 })
  }

  // Cancel reservation (soft delete)
  const { data: reservation, error } = await supabase
    .from('reservations')
    .update({
      status: 'cancelled',
      cancellation_date: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return errorResponse(error)
  }

  // Return seats to inventory
  if (existing.flight_id) {
    const passengersToReturn = (existing.adults || 0) + (existing.children || 0) + (existing.infants || 0)

    const { data: modalities } = await supabase
      .from('modalities')
      .select('id, modality_inventories(id, sold)')
      .eq('flight_id', existing.flight_id)
      .limit(1)

    if (modalities && modalities.length > 0) {
      const inventory = modalities[0].modality_inventories?.[0]
      if (inventory) {
        await supabase
          .from('modality_inventories')
          .update({ sold: Math.max(0, (inventory.sold || 0) - passengersToReturn) })
          .eq('id', inventory.id)
      }
    }
  }

  return NextResponse.json(reservation)
}
