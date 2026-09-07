import { NextResponse } from 'next/server'
import { type DBFlight } from '@/lib/travelcompositor/mapper'
import { syncSingleFlight } from '@/lib/travelcompositor/sync-flight'
import { hasCredentials } from '@/lib/travelcompositor/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

// Cliente sin tipos para operaciones de update

// POST /api/sync - Sync a flight to TravelCompositor
export async function POST(request: Request) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  if (!hasCredentials()) {
    return NextResponse.json(
      { error: 'TravelCompositor credentials not configured' },
      { status: 500 }
    )
  }

  try {
    const body = await request.json()
    const { flightId } = body

    console.log('[SYNC API] Received sync request for flightId:', flightId)

    if (!flightId) {
      return NextResponse.json({ error: 'flightId is required' }, { status: 400 })
    }

    const db = createAdminClient()

    // Fetch the complete flight with all relations
    const { data: flightData, error } = await db
      .from('flights')
      .select(`
        *,
        flight_segments(*),
        flight_datasheets(*),
        flight_cancellations(*),
        modalities(*, modality_inventories(*))
      `)
      .eq('id', flightId)
      .single()

    if (error || !flightData) {
      return NextResponse.json(
        { error: 'Flight not found', details: error?.message },
        { status: 404 }
      )
    }

    const flight = flightData as DBFlight

    console.log('[SYNC API] Flight data:', {
      id: flight.id,
      name: flight.name,
      supplier_id: flight.supplier_id,
      leg_type: flight.leg_type,
      paired_flight_id: flight.paired_flight_id,
      tc_transport_id: flight.tc_transport_id
    })

    // Step 1: Sync this flight
    console.log('[SYNC API] Step 1: Syncing flight to TC...')
    const result = await syncSingleFlight(db, flight)

    console.log('[SYNC API] Sync result:', result)

    if (!result.success) {
      console.log('[SYNC API] Sync FAILED for flight:', flight.id)
      return NextResponse.json(
        { error: 'Failed to sync transport', details: result.error },
        { status: 500 }
      )
    }

    console.log('[SYNC API] Sync SUCCESS for flight:', flight.id, 'TC ID:', result.transportId)
    const transportId = result.transportId!
    let pairedFlightSynced = false
    let pairedTransportId: string | null = null

    // Step 2: Handle paired flight linking
    // IMPORTANT: combinable_rt_contracts ONLY goes on the OUTBOUND (Ida) flight
    // The outbound flight points to the return flight's TC ID
    if (flight.paired_flight_id) {
      // Fetch paired flight
      const { data: pairedFlightData } = await db
        .from('flights')
        .select(`
          *,
          flight_segments(*),
          flight_datasheets(*),
          flight_cancellations(*),
          modalities(*, modality_inventories(*))
        `)
        .eq('id', flight.paired_flight_id)
        .single()

      if (pairedFlightData) {
        const pairedFlight = pairedFlightData as DBFlight

        if (pairedFlight.tc_transport_id) {
          pairedTransportId = pairedFlight.tc_transport_id

          // Only the OUTBOUND flight gets combinableRtContracts pointing to return
          if (flight.leg_type === 'outbound') {
            // Re-sync outbound flight with return's TC ID in combinableRtContracts
            await syncSingleFlight(db, { ...flight, tc_transport_id: transportId }, [pairedTransportId])
          }
          // Return flight does NOT get combinableRtContracts - no need to re-sync

          pairedFlightSynced = true
        }
      }
    }

    // Build response message
    let message = 'Flight synced successfully'
    if (result.error) {
      message = `Transport synced but modality failed: ${result.error}`
    }
    if (pairedFlightSynced) {
      message += `. Linked with paired flight (${pairedTransportId})`
    }

    return NextResponse.json({
      success: true,
      transportId,
      pairedTransportId,
      message,
    })
  } catch (error) {
    console.error('Sync error:', error)
    return errorResponse(error)
  }
}
