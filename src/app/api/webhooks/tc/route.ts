import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logSyncOperation } from '@/lib/logger'
import { getBooking, deleteTransport, validateTransportPrice } from '@/lib/travelcompositor/client'
import type { TCBookingTransportService } from '@/lib/travelcompositor/types'

// Use service role for webhook (no user auth)
function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Webhook notification payload (minimal - just tells us what happened)
interface TCWebhookNotification {
  event?: string                // "CREATED", "MODIFIED", "CANCELED"
  action?: string               // Alternative: "create", "modify", "cancel"
  bookingId?: string
  bookingReference?: string     // "SIV-800"
  // Full payload for storage
  [key: string]: unknown
}

// Extract transport ID from TC service ID (e.g., "SIV-11-0" -> find matching tc_transport_id)
async function findFlightByTCId(db: ReturnType<typeof getSupabaseAdmin>, tcServiceId: string) {
  // TC service ID might be the tc_transport_id or contain it
  // First try exact match
  const { data: flight } = await db
    .from('flights')
    .select('id, tc_transport_id, name')
    .eq('tc_transport_id', tcServiceId)
    .single()

  if (flight) return flight

  // Try partial match (TC might add suffixes)
  const baseId = tcServiceId.split('-').slice(0, -1).join('-')
  if (baseId) {
    const { data: flights } = await db
      .from('flights')
      .select('id, tc_transport_id, name')
      .ilike('tc_transport_id', `${baseId}%`)
      .limit(1)

    if (flights && flights.length > 0) {
      return flights[0]
    }
  }

  return null
}

// Update inventory (sold count) and check for auto-deactivation
// Uses atomic SQL function to prevent race conditions
async function updateInventory(
  db: ReturnType<typeof getSupabaseAdmin>,
  flightId: number,
  passengersDelta: number
): Promise<{ soldOut: boolean; remaining: number; tcTransportId?: string }> {
  // Use atomic function to update inventory (prevents race conditions)
  const { data: inventoryResult, error: rpcError } = await db.rpc('update_inventory_atomic', {
    p_flight_id: flightId,
    p_passengers_delta: passengersDelta,
  })

  if (rpcError) {
    console.error(`[Inventory] RPC error for flight ${flightId}:`, rpcError)
    return { soldOut: false, remaining: 0 }
  }

  const result = inventoryResult?.[0]
  if (!result) {
    console.log(`[Inventory] No inventory found for flight ${flightId}`)
    return { soldOut: false, remaining: 0 }
  }

  const { sold_out: soldOut, remaining, new_sold: newSold, quantity, tc_transport_id: tcTransportId } = result

  console.log(`[Inventory] Flight ${flightId}: sold=${newSold}, quantity=${quantity}, remaining=${remaining} (atomic update)`)

  // Check if sold out (remaining = 0)
  if (soldOut) {
    // Get flight details for deactivation (paired flight info)
    const { data: flight } = await db
      .from('flights')
      .select('id, tc_transport_id, paired_flight_id, active')
      .eq('id', flightId)
      .single()

    if (flight?.active) {
      console.log(`[Inventory] Flight ${flightId} is SOLD OUT - deactivating...`)

      // Deactivate flight locally
      await db
        .from('flights')
        .update({ active: false })
        .eq('id', flightId)

      // Deactivate in TravelCompositor if has tc_transport_id
      if (tcTransportId) {
        const deleteResult = await deleteTransport(tcTransportId)
        if (deleteResult.success) {
          console.log(`[Inventory] Flight ${flightId} deactivated in TC: ${tcTransportId}`)
        } else {
          console.error(`[Inventory] Failed to deactivate in TC: ${deleteResult.error}`)
        }
      }

      // Also deactivate paired flight if exists
      if (flight.paired_flight_id) {
        const { data: pairedFlight } = await db
          .from('flights')
          .select('id, tc_transport_id, active')
          .eq('id', flight.paired_flight_id)
          .single()

        if (pairedFlight?.active) {
          await db
            .from('flights')
            .update({ active: false })
            .eq('id', pairedFlight.id)

          if (pairedFlight.tc_transport_id) {
            await deleteTransport(pairedFlight.tc_transport_id)
            console.log(`[Inventory] Paired flight ${pairedFlight.id} deactivated in TC: ${pairedFlight.tc_transport_id}`)
          }
        }
      }

      // Log the auto-deactivation
      await logSyncOperation({
        entity_type: 'flight',
        entity_id: flightId,
        action: 'update',
        direction: 'push',
        status: 'success',
        request_payload: { reason: 'sold_out', remaining: 0, sold: newSold, quantity },
        response_payload: { deactivated: true, tc_transport_id: tcTransportId },
      })
    }
  }

  return {
    soldOut,
    remaining,
    tcTransportId: tcTransportId || undefined,
  }
}

// Handle new booking
async function handleNewBooking(
  db: ReturnType<typeof getSupabaseAdmin>,
  service: TCBookingTransportService,
  bookingReference: string,
  bookingPayload: Record<string, unknown>
) {
  // Check if reservation already exists
  const { data: existing } = await db
    .from('reservations')
    .select('id')
    .eq('booking_reference', service.bookingReference)
    .single()

  if (existing) {
    return { action: 'skipped', reason: 'Reservation already exists' }
  }

  // Find the flight by TC transport ID
  const flight = await findFlightByTCId(db, service.id)

  // Calculate passengers
  const adults = service.adults || 0
  const children = service.children || 0
  const infants = service.infants || 0
  const totalPassengers = adults + children + infants

  // Validate price against TC transport prices
  let priceValidation = null
  const transportId = flight?.tc_transport_id || service.transportId || service.id
  if (transportId && service.totalAmount) {
    priceValidation = await validateTransportPrice(
      transportId,
      adults,
      children,
      infants,
      service.totalAmount,
      false, // Assume one-way by default
      10 // 10% tolerance
    )

    if (priceValidation.transportFound && !priceValidation.isValid) {
      console.warn(`[TC Webhook] Price discrepancy detected for ${service.bookingReference}:`, {
        expected: priceValidation.expectedPrice,
        actual: priceValidation.actualPrice,
        diff: `${priceValidation.percentDiff.toFixed(2)}%`,
      })
      // Log but don't reject - prices may have dynamic components
    }
  }

  // Insert reservation
  const { data: reservation, error } = await db
    .from('reservations')
    .insert({
      booking_reference: service.bookingReference,
      tc_service_id: service.id,
      tc_transport_id: flight?.tc_transport_id || service.transportId || service.id,
      provider: service.provider,
      provider_description: service.providerDescription,
      provider_configuration_id: service.providerConfigurationId,
      flight_id: flight?.id || null,
      status: 'confirmed',
      adults,
      children,
      infants,
      total_amount: service.totalAmount,
      currency: service.currency || 'USD',
      travel_date: service.departureDate,
      webhook_payload: bookingPayload,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create reservation: ${error.message}`)
  }

  // Update inventory if we found the flight
  let inventoryResult = null
  if (flight?.id && totalPassengers > 0) {
    inventoryResult = await updateInventory(db, flight.id, totalPassengers)
  }

  return {
    action: 'created',
    reservation,
    flight,
    inventory: inventoryResult,
    priceValidation: priceValidation ? {
      isValid: priceValidation.isValid,
      expectedPrice: priceValidation.expectedPrice,
      actualPrice: priceValidation.actualPrice,
      percentDiff: priceValidation.percentDiff,
    } : null,
  }
}

// Handle booking modification
async function handleModifyBooking(
  db: ReturnType<typeof getSupabaseAdmin>,
  service: TCBookingTransportService,
  bookingReference: string,
  bookingPayload: Record<string, unknown>
) {
  // Find existing reservation
  const { data: existing } = await db
    .from('reservations')
    .select('*')
    .eq('booking_reference', service.bookingReference)
    .single()

  if (!existing) {
    // If not found, create it as a new booking
    return handleNewBooking(db, service, bookingReference, bookingPayload)
  }

  // Calculate passenger difference for inventory update
  const newAdults = service.adults || 0
  const newChildren = service.children || 0
  const newInfants = service.infants || 0
  const oldTotal = (existing.adults || 0) + (existing.children || 0) + (existing.infants || 0)
  const newTotal = newAdults + newChildren + newInfants
  const passengersDelta = newTotal - oldTotal

  // Update reservation
  const { data: reservation, error } = await db
    .from('reservations')
    .update({
      status: 'modified',
      adults: newAdults,
      children: newChildren,
      infants: newInfants,
      total_amount: service.totalAmount,
      travel_date: service.departureDate,
      modification_date: new Date().toISOString(),
      webhook_payload: bookingPayload,
    })
    .eq('booking_reference', service.bookingReference)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to modify reservation: ${error.message}`)
  }

  // Update inventory if passengers changed
  let inventoryResult = null
  if (existing.flight_id && passengersDelta !== 0) {
    inventoryResult = await updateInventory(db, existing.flight_id, passengersDelta)
  }

  return {
    action: 'modified',
    reservation,
    passengersDelta,
    inventory: inventoryResult,
  }
}

// Handle booking cancellation
async function handleCancelBooking(
  db: ReturnType<typeof getSupabaseAdmin>,
  service: TCBookingTransportService,
  bookingPayload: Record<string, unknown>
) {
  // Find existing reservation
  const { data: existing } = await db
    .from('reservations')
    .select('*')
    .eq('booking_reference', service.bookingReference)
    .single()

  if (!existing) {
    return { action: 'skipped', reason: 'Reservation not found' }
  }

  if (existing.status === 'cancelled') {
    return { action: 'skipped', reason: 'Already cancelled' }
  }

  // Calculate passengers to return to inventory (negative delta)
  const passengersToReturn = -((existing.adults || 0) + (existing.children || 0) + (existing.infants || 0))

  // Update reservation
  const { data: reservation, error } = await db
    .from('reservations')
    .update({
      status: 'cancelled',
      cancellation_date: new Date().toISOString(),
      webhook_payload: bookingPayload,
    })
    .eq('booking_reference', service.bookingReference)
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to cancel reservation: ${error.message}`)
  }

  // Return seats to inventory
  let inventoryResult = null
  if (existing.flight_id && passengersToReturn !== 0) {
    inventoryResult = await updateInventory(db, existing.flight_id, passengersToReturn)
  }

  return {
    action: 'cancelled',
    reservation,
    seatsReturned: -passengersToReturn,
    inventory: inventoryResult,
  }
}

// Determine event type from notification
function getEventType(notification: TCWebhookNotification): 'create' | 'modify' | 'cancel' {
  const event = (notification.event || notification.action || '').toUpperCase()

  if (event.includes('CANCEL')) return 'cancel'
  if (event.includes('MODIF')) return 'modify'
  if (event.includes('CREAT')) return 'create'

  // Default to create
  return 'create'
}

// POST /api/webhooks/tc - Receive webhook notification from TravelCompositor
export async function POST(request: NextRequest) {
  // 1. Validar secret en header para autenticar que viene de TravelCompositor
  const webhookSecret = request.headers.get('x-tc-webhook-secret')
  const expectedSecret = process.env.TC_WEBHOOK_SECRET

  if (!expectedSecret) {
    console.error('[TC Webhook] TC_WEBHOOK_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (webhookSecret !== expectedSecret) {
    console.warn('[TC Webhook] Intento de acceso no autorizado', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseAdmin()

  try {
    const notification: TCWebhookNotification = await request.json()

    // Log incoming webhook notification
    console.log('[TC Webhook] Received notification:', {
      event: notification.event || notification.action,
      bookingReference: notification.bookingReference || notification.bookingId,
    })

    // Extract booking reference from notification
    const bookingReference = notification.bookingReference || notification.bookingId
    if (!bookingReference) {
      console.error('[TC Webhook] No booking reference in notification')
      return NextResponse.json(
        { success: false, error: 'No booking reference provided' },
        { status: 400 }
      )
    }

    // Fetch full booking details from TC
    console.log(`[TC Webhook] Fetching booking details for: ${bookingReference}`)
    const bookingDetails = await getBooking(bookingReference)

    if (!bookingDetails) {
      console.error(`[TC Webhook] Could not fetch booking: ${bookingReference}`)
      await logSyncOperation({
        entity_type: 'reservation',
        entity_id: 0,
        action: 'create',
        direction: 'pull',
        status: 'error',
        error_message: `Failed to fetch booking details from TC: ${bookingReference}`,
        request_payload: notification as unknown as Record<string, unknown>,
      })
      return NextResponse.json(
        { success: false, error: `Failed to fetch booking: ${bookingReference}` },
        { status: 500 }
      )
    }

    console.log('[TC Webhook] Booking details received:', {
      id: bookingDetails.id,
      status: bookingDetails.status,
      transportServices: bookingDetails.transportservice?.length || 0,
    })

    // Process transport services from the booking
    // Filter to only process services from our supplier (cupos)
    const TC_SUPPLIER_ID = parseInt(process.env.TC_SUPPLIER_ID || '0', 10)
    const allTransportServices = bookingDetails.transportservice || []
    const transportServices = allTransportServices.filter(
      service => service.providerConfigurationId === TC_SUPPLIER_ID
    )

    console.log(`[TC Webhook] Filtering services: ${allTransportServices.length} total, ${transportServices.length} from our supplier (${TC_SUPPLIER_ID})`)

    const results: Array<{ service: string; result: unknown }> = []
    const eventType = getEventType(notification)
    const bookingPayload = bookingDetails as unknown as Record<string, unknown>

    for (const service of transportServices) {
      try {
        let result

        switch (eventType) {
          case 'cancel':
            result = await handleCancelBooking(db, service, bookingPayload)
            break
          case 'modify':
            result = await handleModifyBooking(db, service, bookingReference, bookingPayload)
            break
          case 'create':
          default:
            result = await handleNewBooking(db, service, bookingReference, bookingPayload)
            break
        }

        results.push({ service: service.bookingReference, result })

        // Log success to sync_logs
        await logSyncOperation({
          entity_type: 'reservation',
          entity_id: result.reservation?.id || 0,
          action: result.action === 'cancelled' ? 'delete' : result.action === 'modified' ? 'update' : 'create',
          direction: 'pull',
          status: 'success',
          request_payload: service as unknown as Record<string, unknown>,
          response_payload: result as unknown as Record<string, unknown>,
        })

        // Log if flight was sold out and deactivated
        if (result.inventory?.soldOut) {
          console.log(`[TC Webhook] Flight SOLD OUT after booking: ${result.inventory.tcTransportId}`)
        }
      } catch (serviceError) {
        const errorMessage = serviceError instanceof Error ? serviceError.message : 'Unknown error'
        results.push({ service: service.bookingReference, result: { error: errorMessage } })

        // Log error to sync_logs
        await logSyncOperation({
          entity_type: 'reservation',
          entity_id: 0,
          action: eventType === 'cancel' ? 'delete' : eventType === 'modify' ? 'update' : 'create',
          direction: 'pull',
          status: 'error',
          error_message: errorMessage,
          request_payload: service as unknown as Record<string, unknown>,
        })
      }
    }

    return NextResponse.json({
      success: true,
      bookingReference,
      processed: results.length,
      results,
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    // Log webhook error
    console.error('[TC Webhook] Processing failed:', errorMessage)
    await logSyncOperation({
      entity_type: 'reservation',
      entity_id: 0,
      action: 'create',
      direction: 'pull',
      status: 'error',
      error_message: `Webhook processing failed: ${errorMessage}`,
    })

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    )
  }
}

// GET /api/webhooks/tc - Health check / verification
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    message: 'TravelCompositor webhook endpoint is active',
    timestamp: new Date().toISOString(),
  })
}
