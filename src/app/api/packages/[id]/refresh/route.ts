import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import type { TCPackageDetailResponse } from '@/lib/travelcompositor/types'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

/**
 * Send price change notification via internal API
 */
async function sendPriceChangeNotification(
  packageId: number,
  tcPackageId: number,
  packageTitle: string,
  oldPrice: number,
  newPrice: number,
  currency: string,
  variancePct: number
) {
  try {
    await fetch(`${APP_URL}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'price_change',
        package_id: packageId,
        data: {
          tc_package_id: tcPackageId,
          package_title: packageTitle,
          old_price: oldPrice,
          new_price: newPrice,
          currency,
          variance_pct: variancePct,
        },
      }),
    })
  } catch (error) {
    console.error('[Notification] Failed to send price change notification:', error)
  }
}

/**
 * Send needs manual quote notification via internal API
 */
async function sendNeedsManualQuoteNotification(
  packageId: number,
  tcPackageId: number,
  packageTitle: string,
  oldPrice: number,
  newPrice: number,
  currency: string,
  variancePct: number
) {
  try {
    await fetch(`${APP_URL}/api/notifications/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'needs_manual_quote',
        package_id: packageId,
        data: {
          tc_package_id: tcPackageId,
          package_title: packageTitle,
          old_price: oldPrice,
          new_price: newPrice,
          currency,
          variance_pct: variancePct,
        },
      }),
    })
  } catch (error) {
    console.error('[Notification] Failed to send needs manual quote notification:', error)
  }
}

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * Extract cost breakdown from package detail
 */
function extractCosts(detail: TCPackageDetailResponse): {
  airCost: number
  landCost: number
  agencyFee: number
  flightDepartureDate: string | null
  airlineCode: string | null
  airlineName: string | null
  flightNumbers: string | null
} {
  let airCost = 0
  let landCost = 0
  let agencyFee = 0
  let flightDepartureDate: string | null = null
  let airlineCode: string | null = null
  let airlineName: string | null = null
  const flightNumbersList: string[] = []

  // Sum transport costs (air)
  if (detail.transports && detail.transports.length > 0) {
    for (const transport of detail.transports) {
      const price = (transport as any).priceBreakdown?.netProvider?.microsite?.amount
        || transport.totalPrice?.amount
        || 0
      airCost += price

      const fee = (transport as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee

      if (!flightDepartureDate && transport.departureDate) {
        flightDepartureDate = transport.departureDate
      }
      if (!airlineCode && transport.marketingAirlineCode) {
        airlineCode = transport.marketingAirlineCode
      }
      if (!airlineName && transport.company) {
        airlineName = transport.company
      }
      if (transport.transportNumber) {
        flightNumbersList.push(transport.transportNumber)
      }
    }
  }

  // Sum hotel costs
  if (detail.hotels && detail.hotels.length > 0) {
    for (const hotel of detail.hotels) {
      const price = (hotel as any).priceBreakdown?.netProvider?.microsite?.amount
        || hotel.totalPrice?.amount
        || 0
      landCost += price
      const fee = (hotel as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum transfer costs
  if (detail.transfers && detail.transfers.length > 0) {
    for (const transfer of detail.transfers) {
      const price = (transfer as any).priceBreakdown?.netProvider?.microsite?.amount
        || transfer.totalPrice?.amount
        || 0
      landCost += price
      const fee = (transfer as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum closed tour costs
  if (detail.closedTours && detail.closedTours.length > 0) {
    for (const tour of detail.closedTours) {
      const price = (tour as any).priceBreakdown?.netProvider?.microsite?.amount
        || tour.totalPrice?.amount
        || 0
      landCost += price
      const fee = (tour as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum ticket costs
  if (detail.tickets && detail.tickets.length > 0) {
    for (const ticket of detail.tickets) {
      const price = (ticket as any).priceBreakdown?.netProvider?.microsite?.amount
        || ticket.totalPrice?.amount
        || 0
      landCost += price
      const fee = (ticket as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum car costs
  if (detail.cars && detail.cars.length > 0) {
    for (const car of detail.cars) {
      const price = (car as any).priceBreakdown?.netProvider?.microsite?.amount
        || car.totalPrice?.amount
        || 0
      landCost += price
      const fee = (car as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  return {
    airCost,
    landCost,
    agencyFee,
    flightDepartureDate,
    airlineCode,
    airlineName,
    flightNumbers: flightNumbersList.length > 0 ? flightNumbersList.join('/') : null,
  }
}

/**
 * POST /api/packages/[id]/refresh
 * Refresh a single package from TravelCompositor API
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getSupabaseClient()

  try {
    // Get existing package from our DB
    const { data: existingPkg, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax, currency, title, send_to_marketing, price_at_creative_creation')
      .eq('id', id)
      .single()

    if (fetchError || !existingPkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    const tcPackageId = existingPkg.tc_package_id
    console.log(`[Refresh] Refreshing package ${id} (TC ID: ${tcPackageId})`)

    // Fetch fresh data from TC API
    // getPackageInfo returns TCPackageInfoResponse which extends TCPackageListItem (includes prices, counters, etc.)
    const [info, detail] = await Promise.all([
      getPackageInfo(tcPackageId),
      getPackageDetail(tcPackageId),
    ])

    if (!info) {
      return NextResponse.json({ error: 'Package not found in TravelCompositor' }, { status: 404 })
    }

    // info contains all the basic package data (prices, counters, title, etc.)
    const tcPackage = info

    const costs = extractCosts(detail)
    const oldPrice = existingPkg.current_price_per_pax
    const newPrice = tcPackage.pricePerPerson.amount

    // Calculate price variance
    const varianceAmount = newPrice - oldPrice
    const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
    const needsManualQuote = Math.abs(variancePct) >= 10

    // Prepare update data
    const updateData: Record<string, unknown> = {
      title: tcPackage.title,
      large_title: tcPackage.largeTitle || null,
      image_url: tcPackage.imageUrl || null,
      departure_date: tcPackage.departureDate || null,
      date_range_start: tcPackage.dateSettings?.availRange?.start || null,
      date_range_end: tcPackage.dateSettings?.availRange?.end || null,
      current_price_per_pax: newPrice,
      total_price: tcPackage.totalPrice.amount,
      currency: tcPackage.pricePerPerson.currency || 'USD',
      price_variance_pct: oldPrice !== newPrice ? variancePct : null,
      needs_manual_quote: oldPrice !== newPrice ? needsManualQuote : false,
      // Counters
      adults_count: tcPackage.counters.adults,
      children_count: tcPackage.counters.children,
      nights_count: tcPackage.counters.hotelNights,
      destinations_count: tcPackage.counters.destinations,
      transports_count: tcPackage.counters.transports,
      hotels_count: tcPackage.counters.hotels,
      transfers_count: tcPackage.counters.transfers,
      cars_count: tcPackage.counters.cars,
      tickets_count: tcPackage.counters.tickets,
      tours_count: tcPackage.counters.closedTours,
      // Status
      tc_active: tcPackage.active,
      themes: tcPackage.themes || [],
      tc_idea_url: tcPackage.ideaUrl || null,
      // Cost breakdown
      air_cost: costs.airCost,
      land_cost: costs.landCost,
      agency_fee: costs.agencyFee,
      flight_departure_date: costs.flightDepartureDate,
      airline_code: costs.airlineCode,
      airline_name: costs.airlineName,
      flight_numbers: costs.flightNumbers,
      // Sync timestamp
      last_sync_at: new Date().toISOString(),
    }

    // If price changed, record original price and timestamp
    if (oldPrice !== newPrice) {
      updateData.original_price_per_pax = oldPrice
      updateData.last_price_change_at = new Date().toISOString()

      // Record price history
      await db.from('package_price_history').insert({
        package_id: existingPkg.id,
        price_per_pax: newPrice,
        total_price: tcPackage.totalPrice.amount,
        currency: tcPackage.pricePerPerson.currency || 'USD',
        previous_price: oldPrice,
        variance_amount: varianceAmount,
        variance_pct: variancePct,
      })

      // If package is in marketing and has creatives, mark as needing update
      if (existingPkg.send_to_marketing) {
        updateData.creative_update_needed = true
        updateData.creative_update_reason = 'price_change'
        updateData.creative_update_requested_at = new Date().toISOString()

        // Send notification (fire and forget)
        sendPriceChangeNotification(
          existingPkg.id,
          existingPkg.tc_package_id,
          existingPkg.title,
          oldPrice,
          newPrice,
          existingPkg.currency || 'USD',
          variancePct
        ).catch(err => console.error('[Refresh] Error sending price change notification:', err))
      }

      // If price variance >= 10%, send needs manual quote notification
      if (needsManualQuote) {
        sendNeedsManualQuoteNotification(
          existingPkg.id,
          existingPkg.tc_package_id,
          existingPkg.title,
          oldPrice,
          newPrice,
          existingPkg.currency || 'USD',
          variancePct
        ).catch(err => console.error('[Refresh] Error sending needs manual quote notification:', err))
      }
    }

    // Update package
    const { error: updateError } = await db
      .from('packages')
      .update(updateData)
      .eq('id', id)

    if (updateError) {
      console.error('[Refresh] Error updating package:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Update destinations
    if (tcPackage.destinations && tcPackage.destinations.length > 0) {
      await db.from('package_destinations').delete().eq('package_id', existingPkg.id)

      const destinationsToInsert = tcPackage.destinations.map((dest, index) => ({
        package_id: existingPkg.id,
        destination_code: dest.code,
        destination_name: dest.name,
        sort_order: index,
      }))

      await db.from('package_destinations').insert(destinationsToInsert)
    }

    // Update transports (flights)
    if (detail.transports && detail.transports.length > 0) {
      // Delete existing transports
      await db.from('package_transports').delete().eq('package_id', existingPkg.id)

      for (let i = 0; i < detail.transports.length; i++) {
        const transport = detail.transports[i] as any

        const transportRecord = {
          package_id: existingPkg.id,
          tc_transport_id: transport.id,
          tc_provider_code: transport.providerCode || null,
          supplier_name: transport.supplier || transport.supplierName || null,
          day: transport.day || null,
          transport_type: transport.transportType || 'PLANE',
          direction: transport.direction || null,
          // TC sends origin/destination in different formats depending on the package
          origin_code: transport.origin?.code || transport.originCode || null,
          origin_name: transport.origin?.name || transport.originDestinationCode || null,
          destination_code: transport.destination?.code || transport.targetCode || null,
          destination_name: transport.destination?.name || transport.targetDestinationCode || null,
          company: transport.company || null,
          transport_number: transport.transportNumber || null,
          marketing_airline_code: transport.marketingAirlineCode || null,
          operating_airline_code: transport.operatingAirlineCode || null,
          operating_airline_name: transport.operatingAirlineName || null,
          departure_date: transport.departureDate || null,
          departure_time: transport.departureTime || null,
          arrival_date: transport.arrivalDate || null,
          arrival_time: transport.arrivalTime || null,
          duration: transport.duration || null,
          day_difference: transport.dayDifference || 0,
          fare: transport.fare || null,
          fare_class: transport.fareClass || null,
          fare_basis: transport.fareBasis || null,
          cabin_class: transport.cabinClass || null,
          baggage_info: transport.baggageInfo || null,
          checked_baggage: transport.checkedBaggage || null,
          cabin_baggage: transport.cabinBaggage || null,
          aircraft_type: transport.aircraftType || null,
          terminal_departure: transport.terminalDeparture || null,
          terminal_arrival: transport.terminalArrival || null,
          num_segments: transport.numSegments || transport.segments?.length || 1,
          net_price: transport.netPrice?.amount || null,
          total_price: transport.totalPrice?.amount || null,
          currency: transport.totalPrice?.currency || 'USD',
          mandatory: transport.mandatory || false,
          is_refundable: true,
          adults_count: transport.adults || tcPackage.counters.adults,
          children_count: transport.children || tcPackage.counters.children,
          infants_count: transport.infants || 0,
          sort_order: i,
        }

        const { error: transportError } = await db
          .from('package_transports')
          .insert(transportRecord)

        if (transportError) {
          console.warn(`[Refresh] Failed to insert transport:`, transportError)
        }
      }
      console.log(`[Refresh] Updated ${detail.transports.length} transports for package ${id}`)
    }

    // Update hotels
    if (detail.hotels && detail.hotels.length > 0) {
      // Delete existing hotels
      await db.from('package_hotels').delete().eq('package_id', existingPkg.id)

      for (let i = 0; i < detail.hotels.length; i++) {
        const hotel = detail.hotels[i] as any

        const hotelRecord = {
          package_id: existingPkg.id,
          tc_hotel_id: hotel.id,
          tc_provider_code: hotel.providerCode || null,
          supplier_name: hotel.supplierName || null,
          hotel_name: hotel.name || null,
          destination_code: hotel.destination?.code || null,
          destination_name: hotel.destination?.name || null,
          check_in_date: hotel.checkInDate || null,
          check_out_date: hotel.checkOutDate || null,
          nights: hotel.nights || null,
          room_type: hotel.roomType || hotel.roomTypes || null,
          room_name: hotel.roomName || hotel.roomTypes || null,
          board_type: hotel.boardType || hotel.mealPlan || null,
          board_name: hotel.boardName || hotel.mealPlan || null,
          net_price: hotel.netPrice?.amount || null,
          total_price: hotel.totalPrice?.amount || null,
          currency: hotel.totalPrice?.currency || 'USD',
          mandatory: hotel.mandatory || false,
          is_refundable: true,
          adults_count: hotel.adults || tcPackage.counters.adults,
          children_count: hotel.children || tcPackage.counters.children,
          infants_count: hotel.infants || 0,
          sort_order: i,
        }

        const { error: hotelError } = await db
          .from('package_hotels')
          .insert(hotelRecord)

        if (hotelError) {
          console.warn(`[Refresh] Failed to insert hotel:`, hotelError)
        }
      }
      console.log(`[Refresh] Updated ${detail.hotels.length} hotels for package ${id}`)
    }

    console.log(`[Refresh] Package ${id} refreshed successfully. Price: ${oldPrice} -> ${newPrice}`)

    return NextResponse.json({
      success: true,
      priceChanged: oldPrice !== newPrice,
      oldPrice,
      newPrice,
      variancePct: oldPrice !== newPrice ? variancePct : 0,
    })
  } catch (error) {
    console.error('[Refresh] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
