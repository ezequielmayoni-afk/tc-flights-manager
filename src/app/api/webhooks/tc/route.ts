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

// Find flight by matching segment data from TC booking with our database
// Matches by: supplier_id + airline_code + date + leg type (IDA/VUELTA)
interface TCSegment {
  departureAirport: string
  arrivalAirport: string
  departureDate: string
  marketingAirlineCode: string
  bookingClass?: string
}

async function findFlightBySegment(
  db: ReturnType<typeof getSupabaseAdmin>,
  segment: TCSegment,
  supplierId: number,
  isReturn: boolean = false
) {
  // Extract date in YYYYMMDD format from departureDate (e.g., "2026-04-30T12:00:00" -> "20260430")
  const dateStr = segment.departureDate.split('T')[0].replace(/-/g, '')
  const legType = isReturn ? 'VUELTA' : 'IDA'

  // Build base_id pattern: AR-EZE-PUJ-20260430-IDA
  const baseIdPattern = `${segment.marketingAirlineCode}-%-${dateStr}-${legType}`

  console.log(`[Webhook] Finding flight: supplier=${supplierId}, ${segment.departureAirport} → ${segment.arrivalAirport}, date: ${dateStr}, leg: ${legType}`)
  console.log(`[Webhook] Searching base_id pattern: ${baseIdPattern}`)

  // Search by supplier_id + base_id pattern + start_date
  const { data: flights } = await db
    .from('flights')
    .select('id, tc_transport_id, name, supplier_id, base_id, start_date, airline_code')
    .eq('supplier_id', supplierId)
    .eq('start_date', segment.departureDate.split('T')[0])
    .eq('airline_code', segment.marketingAirlineCode)
    .ilike('base_id', baseIdPattern)

  if (flights && flights.length > 0) {
    console.log(`[Webhook] Found ${flights.length} flights matching pattern for supplier ${supplierId}`)
    return flights[0]
  }

  // Fallback 1: try matching by supplier_id + start_date + airports in name/base_id
  const { data: fallbackFlights } = await db
    .from('flights')
    .select('id, tc_transport_id, name, supplier_id, base_id, start_date, airline_code')
    .eq('supplier_id', supplierId)
    .eq('start_date', segment.departureDate.split('T')[0])
    .or(`name.ilike.%${segment.departureAirport}%,base_id.ilike.%${segment.departureAirport}%`)

  if (fallbackFlights && fallbackFlights.length > 0) {
    console.log(`[Webhook] Fallback 1 found ${fallbackFlights.length} flights for supplier ${supplierId}`)
    return fallbackFlights[0]
  }

  // Fallback 2: try matching by just supplier_id + start_date + airline_code
  // This is the simplest match - useful when base_id doesn't follow standard pattern
  const { data: simpleFlights } = await db
    .from('flights')
    .select('id, tc_transport_id, name, supplier_id, base_id, start_date, airline_code')
    .eq('supplier_id', supplierId)
    .eq('start_date', segment.departureDate.split('T')[0])
    .eq('airline_code', segment.marketingAirlineCode)

  if (simpleFlights && simpleFlights.length > 0) {
    console.log(`[Webhook] Fallback 2 (simple match) found ${simpleFlights.length} flights for supplier ${supplierId}, airline ${segment.marketingAirlineCode}`)
    return simpleFlights[0]
  }

  console.log(`[Webhook] No flight found for segment (supplier: ${supplierId})`)
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
  bookingReference: string,  // Main booking reference (e.g., "SIV-948")
  bookingPayload: Record<string, unknown>
) {
  // Check if reservation already exists by tc_service_id (unique per transport service)
  const { data: existing } = await db
    .from('reservations')
    .select('id')
    .eq('tc_service_id', service.id)
    .single()

  if (existing) {
    return { action: 'skipped', reason: 'Reservation already exists' }
  }

  // Find flights by matching segments from TC with our database
  // Use service.supplierId to filter by the correct supplier (cupos provider)
  const segments = service.segment || []
  const supplierId = service.supplierId
  const matchedFlights: Array<{ flight: Awaited<ReturnType<typeof findFlightBySegment>>; isReturn: boolean }> = []

  console.log(`[TC Webhook] Matching segments for supplier ${supplierId} (${service.supplierName || 'unknown'})`)

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    const isReturn = i > 0 // First segment is outbound, rest are return
    const flight = await findFlightBySegment(db, segment, supplierId, isReturn)
    if (flight) {
      matchedFlights.push({ flight, isReturn })
      console.log(`[TC Webhook] Matched segment ${i + 1}: ${flight.tc_transport_id} (supplier_id: ${flight.supplier_id})`)
    }
  }

  // Use the first matched flight for the reservation (outbound leg)
  const flight = matchedFlights.length > 0 ? matchedFlights[0].flight : null

  if (matchedFlights.length === 0) {
    console.log(`[TC Webhook] No matching flights found in our database for booking ${service.bookingReference} - reservation will be created without flight link`)
  } else {
    console.log(`[TC Webhook] Found ${matchedFlights.length} matching flights for booking ${service.bookingReference}`)
  }

  // Calculate passengers - TC sends counts at BOOKING level, not service level
  // TC uses: adultCount, childCount, infantCount
  const svc = service as unknown as Record<string, unknown>
  const bookingData = bookingPayload as Record<string, unknown>

  // Primary: TC booking level fields (adultCount, childCount, infantCount)
  let adults = (bookingData.adultCount || 0) as number
  let children = (bookingData.childCount || 0) as number
  let infants = (bookingData.infantCount || 0) as number

  console.log(`[TC Webhook] Booking level counts: adults=${adults}, children=${children}, infants=${infants}`)

  // Fallback: try distribution array (for multi-room bookings)
  if (adults === 0 && children === 0 && infants === 0) {
    const distribution = bookingData.distribution as Array<Record<string, unknown>> | undefined
    if (Array.isArray(distribution) && distribution.length > 0) {
      for (const dist of distribution) {
        adults += (dist.adults || dist.adultCount || 0) as number
        children += (dist.children || dist.childCount || 0) as number
        infants += (dist.infants || dist.infantCount || 0) as number
      }
      console.log(`[TC Webhook] From distribution: adults=${adults}, children=${children}, infants=${infants}`)
    }
  }

  // Fallback: service level
  if (adults === 0 && children === 0 && infants === 0) {
    adults = (service.adults || svc.adultCount || 0) as number
    children = (service.children || svc.childCount || 0) as number
    infants = (service.infants || svc.infantCount || 0) as number
  }

  const totalPassengers = adults + children + infants

  console.log(`[TC Webhook] Final passengers: ${totalPassengers} (adults=${adults}, children=${children}, infants=${infants})`)

  // Validate price against TC transport prices
  let priceValidation = null
  const transportId = flight?.tc_transport_id || service.transportId || service.id
  const amountToValidate = service.totalAmount || service.netAmount
  if (transportId && amountToValidate) {
    priceValidation = await validateTransportPrice(
      transportId,
      adults,
      children,
      infants,
      amountToValidate,
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

  // Extract total amount - TC uses pricebreakdown.totalPrice.microsite.amount
  const pricebreakdown = svc.pricebreakdown as Record<string, unknown> | undefined
  const totalPrice = pricebreakdown?.totalPrice as Record<string, unknown> | undefined
  const micrositePrice = totalPrice?.microsite as Record<string, unknown> | undefined
  let totalAmount = (micrositePrice?.amount as number) || null

  // Fallback: try other price fields
  if (!totalAmount) {
    totalAmount = service.totalAmount || service.netAmount ||
      (svc.totalAmount as number) || (svc.netAmount as number) || null
  }

  // Extract travel date - TC uses startDate at service level
  let travelDate = (svc.startDate as string) || service.startDate || service.departureDate || null

  // Fallback: try first segment's departureDate
  if (!travelDate && segments.length > 0) {
    travelDate = segments[0].departureDate || null
  }

  // Format date to YYYY-MM-DD if it's a datetime string
  if (travelDate && travelDate.includes('T')) {
    travelDate = travelDate.split('T')[0]
  }

  console.log(`[TC Webhook] Amount: ${totalAmount}, Travel date: ${travelDate}`)

  // Insert reservation - use main booking reference (e.g., "SIV-948")
  const { data: reservation, error } = await db
    .from('reservations')
    .insert({
      booking_reference: bookingReference,  // Main booking ref (SIV-948), not service ref
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
      total_amount: totalAmount,
      currency: service.currency || (svc.currency as string) || 'USD',
      travel_date: travelDate,
      webhook_payload: bookingPayload,
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create reservation: ${error.message}`)
  }

  // Update inventory for ALL matched flights (both outbound and return legs)
  const inventoryResults: Array<{ flightId: number; tcTransportId: string; result: Awaited<ReturnType<typeof updateInventory>> }> = []
  if (totalPassengers > 0) {
    for (const { flight: matchedFlight } of matchedFlights) {
      if (matchedFlight?.id) {
        const result = await updateInventory(db, matchedFlight.id, totalPassengers)
        inventoryResults.push({
          flightId: matchedFlight.id,
          tcTransportId: matchedFlight.tc_transport_id,
          result,
        })
        console.log(`[TC Webhook] Updated inventory for flight ${matchedFlight.tc_transport_id}: ${totalPassengers} passengers`)
      }
    }
  }

  return {
    action: 'created',
    reservation,
    flight,
    matchedFlights: matchedFlights.map(mf => ({
      tcTransportId: mf.flight?.tc_transport_id,
      supplierId: mf.flight?.supplier_id,
      isReturn: mf.isReturn,
    })),
    inventoryResults,
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
  // Find existing reservation by tc_service_id
  const { data: existing } = await db
    .from('reservations')
    .select('*')
    .eq('tc_service_id', service.id)
    .single()

  if (!existing) {
    // If not found, create it as a new booking
    return handleNewBooking(db, service, bookingReference, bookingPayload)
  }

  // Extract passengers - TC uses adultCount, childCount, infantCount at booking level
  const svc = service as unknown as Record<string, unknown>
  const bookingData = bookingPayload as Record<string, unknown>

  let newAdults = (bookingData.adultCount || 0) as number
  let newChildren = (bookingData.childCount || 0) as number
  let newInfants = (bookingData.infantCount || 0) as number

  // Fallback: try distribution array
  if (newAdults === 0 && newChildren === 0 && newInfants === 0) {
    const distribution = bookingData.distribution as Array<Record<string, unknown>> | undefined
    if (Array.isArray(distribution) && distribution.length > 0) {
      for (const dist of distribution) {
        newAdults += (dist.adults || dist.adultCount || 0) as number
        newChildren += (dist.children || dist.childCount || 0) as number
        newInfants += (dist.infants || dist.infantCount || 0) as number
      }
    }
  }

  const oldTotal = (existing.adults || 0) + (existing.children || 0) + (existing.infants || 0)
  const newTotal = newAdults + newChildren + newInfants
  const passengersDelta = newTotal - oldTotal

  // Extract amount - TC uses pricebreakdown.totalPrice.microsite.amount
  const pricebreakdown = svc.pricebreakdown as Record<string, unknown> | undefined
  const totalPriceObj = pricebreakdown?.totalPrice as Record<string, unknown> | undefined
  const micrositePrice = totalPriceObj?.microsite as Record<string, unknown> | undefined
  let totalAmount = (micrositePrice?.amount as number) || service.totalAmount || service.netAmount || null

  // Extract travel date - TC uses startDate at service level
  const segments = service.segment || []
  let travelDate = (svc.startDate as string) || service.startDate || service.departureDate || null
  if (!travelDate && segments.length > 0) {
    travelDate = segments[0].departureDate || null
  }
  if (travelDate && travelDate.includes('T')) {
    travelDate = travelDate.split('T')[0]
  }

  // Update reservation
  const { data: reservation, error } = await db
    .from('reservations')
    .update({
      status: 'modified',
      adults: newAdults,
      children: newChildren,
      infants: newInfants,
      total_amount: totalAmount,
      travel_date: travelDate,
      modification_date: new Date().toISOString(),
      webhook_payload: bookingPayload,
    })
    .eq('tc_service_id', service.id)
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
  // Find existing reservation by tc_service_id
  const { data: existing } = await db
    .from('reservations')
    .select('*')
    .eq('tc_service_id', service.id)
    .single()

  if (!existing) {
    return { action: 'skipped', reason: 'Reservation not found' }
  }

  if (existing.status === 'cancelled') {
    return { action: 'skipped', reason: 'Already cancelled' }
  }

  // Calculate passengers to return to inventory (negative delta)
  const passengersToReturn = -((existing.adults || 0) + (existing.children || 0) + (existing.infants || 0))

  // Update reservation by tc_service_id
  const { data: reservation, error } = await db
    .from('reservations')
    .update({
      status: 'cancelled',
      cancellation_date: new Date().toISOString(),
      webhook_payload: bookingPayload,
    })
    .eq('tc_service_id', service.id)
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

    // Get list of supplier IDs we manage (cupos providers)
    const { data: suppliers } = await db.from('suppliers').select('id')
    const ourSupplierIds = (suppliers || []).map(s => s.id)

    // Filter to only process transport services from our suppliers
    // NOTE: Since we sync transports with the correct supplier_id in the URL,
    // TC's supplierId now correctly represents the real cupos provider
    const allTransportServices = bookingDetails.transportservice || []
    const transportServices = allTransportServices.filter(
      service => ourSupplierIds.includes(service.supplierId)
    )

    console.log(`[TC Webhook] Filtering: ${allTransportServices.length} total services, ${transportServices.length} from our suppliers (${ourSupplierIds.join(', ')})`)

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
        // Check both inventory (modify/cancel) and inventoryResults (create)
        if ('inventory' in result && result.inventory?.soldOut) {
          console.log(`[TC Webhook] Flight SOLD OUT after booking: ${result.inventory.tcTransportId}`)
        }
        if ('inventoryResults' in result && result.inventoryResults) {
          for (const inv of result.inventoryResults) {
            if (inv.result.soldOut) {
              console.log(`[TC Webhook] Flight SOLD OUT after booking: ${inv.tcTransportId}`)
            }
          }
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
