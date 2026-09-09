import { NextRequest, NextResponse } from 'next/server'
import { enqueueJob } from '@/lib/jobs/queue'
import { logSyncOperation } from '@/lib/logger'
import { getBooking, deleteTransport, validateTransportPrice, tcClient } from '@/lib/travelcompositor/client'
import { mapModalityToTC } from '@/lib/travelcompositor/mapper'
import type { TCBookingTransportService, TCBookingResponse } from '@/lib/travelcompositor/types'
import { createAdminClient } from '@/lib/supabase/admin'

// Use service role for webhook (no user auth)

// Webhook notification payload (minimal - just tells us what happened)
interface TCWebhookNotification {
  event?: string                // "CREATED", "MODIFIED", "CANCELED"
  action?: string               // Alternative: "create", "modify", "cancel"
  bookingId?: string
  bookingReference?: string     // "SIV-800"
  // TEST MODE: If booking object is provided, use it directly (bypass getBooking API call)
  booking?: Record<string, unknown>
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
  /** Número de vuelo tal como lo manda TC en la reserva, ej "3812". */
  flightNumber?: string
  bookingClass?: string
}

async function findFlightBySegment(
  db: ReturnType<typeof createAdminClient>,
  segment: TCSegment,
  supplierId: number,
  isReturn: boolean = false
) {
  const fecha = segment.departureDate.split('T')[0]
  const legType = isReturn ? 'return' : 'outbound'

  console.log(`[Webhook] Buscando cupo: proveedor=${supplierId}, ${segment.departureAirport} → ${segment.arrivalAirport}, ${fecha}, tramo ${legType}, vuelo ${segment.marketingAirlineCode}${segment.flightNumber}`)

  // Se traen los candidatos del día con sus segmentos y se elige en código.
  // Antes se filtraba por un patrón de base_id (JA-%-20270220-IDA) que no
  // cumplen los cupos con base_id numérico, y los fallbacks no miraban ni el
  // tramo ni la ruta: una vuelta de otro cupo que sale el mismo día se quedaba
  // con la reserva. Pasó con SIV-2895 el 07/09.
  const { data: candidatos } = await db
    .from('flights')
    .select('id, tc_transport_id, name, supplier_id, base_id, start_date, airline_code, leg_type, flight_segments(departure_location_code, arrival_location_code, num_service, sort_order)')
    .eq('supplier_id', supplierId)
    .eq('start_date', fecha)
    .eq('airline_code', segment.marketingAirlineCode)
    .order('id')

  if (!candidatos || candidatos.length === 0) {
    console.log('[Webhook] Sin cupos de esa aerolínea y fecha para el proveedor')
    return null
  }

  // El tramo es lo primero que tiene que coincidir: una ida nunca se imputa a
  // una vuelta, por más que vuelen el mismo día.
  const delTramo = candidatos.filter(f => (f.leg_type || 'outbound') === legType)
  const pool = delTramo.length > 0 ? delTramo : candidatos

  const soloDigitos = (v: string | null | undefined) => (v || '').replace(/\D/g, '')
  const numeroReserva = soloDigitos(segment.flightNumber)

  const rutaCoincide = (f: typeof pool[number]) => {
    const segs = f.flight_segments || []
    if (segs.length === 0) return false
    const origen = segs[0]?.departure_location_code
    const destino = segs[segs.length - 1]?.arrival_location_code
    return origen === segment.departureAirport && destino === segment.arrivalAirport
  }

  const numeroCoincide = (f: typeof pool[number]) =>
    !!numeroReserva && (f.flight_segments || []).some(s => soloDigitos(s.num_service) === numeroReserva)

  // De más preciso a menos: ruta + número, después ruta, después lo que quede.
  const porRutaYNumero = pool.filter(f => rutaCoincide(f) && numeroCoincide(f))
  const porRuta = pool.filter(rutaCoincide)
  const elegido = porRutaYNumero[0] || porRuta[0] || (delTramo.length > 0 ? delTramo[0] : null)

  if (!elegido) {
    console.log('[Webhook] Ningún cupo del mismo tramo coincide con la ruta')
    return null
  }

  const criterio = porRutaYNumero[0] ? 'ruta + número de vuelo' : porRuta[0] ? 'ruta' : 'solo tramo y fecha'
  console.log(`[Webhook] Cupo elegido: ${elegido.base_id} (id ${elegido.id}) por ${criterio}`)

  if (!porRuta[0]) {
    console.warn(`[Webhook] ATENCIÓN: se imputó por tramo y fecha sin verificar la ruta (${segment.departureAirport}→${segment.arrivalAirport})`)
  }

  return elegido
}

/**
 * Empuja a TC los lugares que quedan en un cupo.
 *
 * Hasta ahora la reserva descontaba el lugar en hub pero TC seguía publicando
 * la cantidad vieja, así que el cupo seguía vendiéndose allá. Solo se tocaba TC
 * cuando el vuelo se agotaba del todo, para desactivarlo.
 *
 * Nunca lanza: si TC falla, la reserva ya está registrada en hub y lo que
 * corresponde es dejar el vuelo marcado en error para poder reintentarlo, no
 * hacer fallar el webhook (TC lo reintentaría entero y duplicaría el descuento).
 */
async function pushInventoryToTC(
  db: ReturnType<typeof createAdminClient>,
  flightId: number
): Promise<{ ok: boolean; error?: string; quantity?: number }> {
  try {
    const { data: flight } = await db
      .from('flights')
      .select('id, base_id, supplier_id, tc_transport_id, start_date, end_date, modalities(*, modality_inventories(*))')
      .eq('id', flightId)
      .single()

    if (!flight?.tc_transport_id) {
      return { ok: false, error: 'El cupo no está sincronizado con TC todavía' }
    }

    const modality = (flight.modalities || [])[0]
    if (!modality) {
      return { ok: false, error: 'El cupo no tiene modalidad cargada' }
    }

    const tcModality = mapModalityToTC(modality, flight.start_date, flight.end_date)
    const quantity = tcModality.inventories?.[0]?.quantity

    const result = await tcClient.syncModality(
      flight.tc_transport_id,
      tcModality,
      true, // ya existe: se actualiza
      flight.supplier_id ?? undefined
    )

    await db
      .from('flights')
      .update({
        sync_status: result.success ? 'synced' : 'error',
        sync_error: result.success ? null : result.error,
        last_sync_at: new Date().toISOString(),
      })
      .eq('id', flightId)

    await logSyncOperation({
      entity_type: 'flight',
      entity_id: flightId,
      action: 'update',
      direction: 'push',
      status: result.success ? 'success' : 'error',
      request_payload: { reason: 'reserva', modality: modality.code, quantity },
      response_payload: { tc_transport_id: flight.tc_transport_id },
      error_message: result.success ? undefined : result.error,
    })

    console.log(`[Inventory] Cupo ${flight.base_id} → TC ${flight.tc_transport_id}: ${quantity} lugares (${result.success ? 'ok' : result.error})`)
    return { ok: result.success, error: result.error, quantity }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[Inventory] No se pudo empujar el cupo ${flightId} a TC:`, message)
    return { ok: false, error: message }
  }
}

/**
 * Aplica un cambio de lugares a las DOS piernas del cupo.
 *
 * Al crear una reserva se recorre cada segmento y se descuenta de la ida y de
 * la vuelta por separado, pero en `reservations` queda guardada una sola
 * pierna. Si al cancelar o modificar se usa solo esa, la otra queda con los
 * lugares vendidos para siempre y el cupo se va desangrando.
 */
async function updateInventoryBothLegs(
  db: ReturnType<typeof createAdminClient>,
  flightId: number,
  passengersDelta: number
): Promise<{ soldOut: boolean; remaining: number; tcTransportId?: string }> {
  const principal = await updateInventory(db, flightId, passengersDelta)

  const { data: flight } = await db
    .from('flights')
    .select('paired_flight_id')
    .eq('id', flightId)
    .single()

  if (flight?.paired_flight_id) {
    console.log(`[Inventory] Aplicando el mismo cambio a la pierna pareja ${flight.paired_flight_id}`)
    await updateInventory(db, flight.paired_flight_id, passengersDelta)
  }

  return principal
}

// Update inventory (sold count) and check for auto-deactivation
// Uses atomic SQL function to prevent race conditions
async function updateInventory(
  db: ReturnType<typeof createAdminClient>,
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

  // Reflejar en TC los lugares que quedan. Vale tanto para una venta (bajan)
  // como para una cancelación (vuelven).
  await pushInventoryToTC(db, flightId)

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

      // El guard decide qué pasa con los anuncios de los paquetes vinculados
      // (redirigir a otra salida o pausar). Nunca inline: el webhook debe responder rápido.
      try {
        await enqueueJob(db, { kind: 'cupo.sold_out', payload: { flightId, tcTransportId }, priority: 8, dedupeKey: `cupo.sold_out:${flightId}`, entityType: 'flight', entityId: flightId, createdBy: 'webhook:tc' })
      } catch (err) {
        console.error('[Inventory] no se pudo encolar cupo.sold_out:', err instanceof Error ? err.message : err)
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
  db: ReturnType<typeof createAdminClient>,
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
  db: ReturnType<typeof createAdminClient>,
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
    inventoryResult = await updateInventoryBothLegs(db, existing.flight_id, passengersDelta)
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
  db: ReturnType<typeof createAdminClient>,
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
    inventoryResult = await updateInventoryBothLegs(db, existing.flight_id, passengersToReturn)
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

  const db = createAdminClient()

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

    // Check for TEST MODE: if booking object is provided in notification, use it directly
    // This allows testing the webhook processing logic without calling TC API
    let bookingDetails
    const isTestMode = !!notification.booking

    if (isTestMode) {
      console.log(`[TC Webhook] TEST MODE: Using booking data from notification (bypassing TC API)`)
      bookingDetails = notification.booking
    } else {
      // Fetch full booking details from TC
      console.log(`[TC Webhook] Fetching booking details for: ${bookingReference}`)
      bookingDetails = await getBooking(bookingReference)
    }

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

    if (isTestMode) {
      console.log('[TC Webhook] TEST MODE: Booking data:', JSON.stringify(bookingDetails, null, 2))
    }

    // Cast to expected type for consistent access
    const booking = bookingDetails as unknown as TCBookingResponse

    console.log('[TC Webhook] Booking details received:', {
      id: booking.id,
      status: booking.status,
      transportServices: booking.transportservice?.length || 0,
    })

    // Get list of supplier IDs we manage (cupos providers)
    const { data: suppliers } = await db.from('suppliers').select('id')
    const ourSupplierIds = (suppliers || []).map(s => s.id)

    // Filter to only process transport services from our suppliers
    // NOTE: Since we sync transports with the correct supplier_id in the URL,
    // TC's supplierId now correctly represents the real cupos provider
    const allTransportServices = booking.transportservice || []
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
