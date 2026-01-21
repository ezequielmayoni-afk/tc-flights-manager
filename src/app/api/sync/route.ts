import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { tcClient } from '@/lib/travelcompositor/client'
import { mapFlightToTransport, mapModalityToTC, createDefaultModality, type DBFlight } from '@/lib/travelcompositor/mapper'
import { hasCredentials } from '@/lib/travelcompositor/auth'

// Cliente sin tipos para operaciones de update
function getUntypedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Helper to sync a single flight (transport + modality)
// Uses flight.supplier_id to sync to the correct supplier in TC
async function syncSingleFlight(
  db: ReturnType<typeof getUntypedClient>,
  flight: DBFlight,
  combinableRtContracts: string[] = []
): Promise<{ success: boolean; transportId?: string; error?: string }> {
  // Override combinable_rt_contracts if provided
  const flightWithCombinables = {
    ...flight,
    combinable_rt_contracts: combinableRtContracts.length > 0 ? combinableRtContracts : flight.combinable_rt_contracts,
  }

  // Map to TC format
  const tcTransport = mapFlightToTransport(flightWithCombinables)

  // Use flight's supplier_id for TC API URL
  const supplierId = flight.supplier_id

  console.log(`[SYNC] Syncing flight ${flight.id} to supplier ${supplierId}`)

  // Sync transport to TC with the correct supplier_id
  const result = await tcClient.syncTransport(tcTransport, supplierId)

  if (!result.success) {
    await db
      .from('flights')
      .update({
        sync_status: 'error',
        sync_error: result.error,
      })
      .eq('id', flight.id)

    return { success: false, error: result.error }
  }

  const transportId = result.transportId!

  // Save TC transport ID if new
  if (!flight.tc_transport_id) {
    await db
      .from('flights')
      .update({ tc_transport_id: transportId })
      .eq('id', flight.id)
  }

  // Sync modalities
  // If flight already had a tc_transport_id, we're updating (use PUT), otherwise creating (use POST)
  const isModalityUpdate = !!flight.tc_transport_id
  const modalities = flight.modalities || []
  let modalitySyncError: string | null = null

  if (modalities.length > 0) {
    const dbModality = modalities[0]
    const tcModality = mapModalityToTC(dbModality, flight.start_date, flight.end_date)
    const modalityResult = await tcClient.syncModality(transportId, tcModality, isModalityUpdate, supplierId)
    if (!modalityResult.success) {
      modalitySyncError = modalityResult.error || 'Modality sync failed'
    }
  } else {
    const defaultModality = createDefaultModality(flight)
    const modalityResult = await tcClient.syncModality(transportId, defaultModality, isModalityUpdate, supplierId)
    if (!modalityResult.success) {
      modalitySyncError = modalityResult.error || 'Default modality sync failed'
    }
  }

  // Update flight status and combinable_rt_contracts
  await db
    .from('flights')
    .update({
      sync_status: modalitySyncError ? 'error' : 'synced',
      sync_error: modalitySyncError,
      last_sync_at: new Date().toISOString(),
      combinable_rt_contracts: combinableRtContracts.length > 0 ? combinableRtContracts : flight.combinable_rt_contracts,
    })
    .eq('id', flight.id)

  // Log the sync to sync_logs table
  const isUpdate = !!flight.tc_transport_id
  await db.from('sync_logs').insert({
    entity_type: 'flight',
    entity_id: flight.id,
    action: isUpdate ? 'update' : 'create',
    direction: 'push',
    status: modalitySyncError ? 'error' : 'success',
    error_message: modalitySyncError || null,
    request_payload: { ...tcTransport, _supplierId: supplierId },
    response_payload: { transportId, name: flight.name, base_id: flight.base_id, supplier_id: supplierId },
  })

  return {
    success: true,
    transportId,
    error: modalitySyncError || undefined,
  }
}

// POST /api/sync - Sync a flight to TravelCompositor
export async function POST(request: Request) {
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

    const db = getUntypedClient()

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
    return NextResponse.json(
      { error: 'Sync failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
