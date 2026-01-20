import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/packages/refresh-all
 * Refresh all packages in marketing with full transport/hotel data
 * This is a one-time operation to populate missing data
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    // Get all packages that are in marketing or published and active
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, title')
      .eq('tc_active', true)
      .or('status.eq.in_marketing,status.eq.published,send_to_marketing.eq.true')
      .order('id', { ascending: true })

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!packages || packages.length === 0) {
      return NextResponse.json({ message: 'No packages to refresh', count: 0 })
    }

    console.log(`[Refresh All] Starting refresh of ${packages.length} packages`)

    const results = {
      total: packages.length,
      success: 0,
      failed: 0,
      errors: [] as string[],
    }

    // Process packages one by one to avoid rate limiting
    for (const pkg of packages) {
      try {
        const [info, detail] = await Promise.all([
          getPackageInfo(pkg.tc_package_id),
          getPackageDetail(pkg.tc_package_id),
        ])

        if (!info || !detail) {
          results.failed++
          results.errors.push(`Package ${pkg.tc_package_id}: Not found in TC`)
          continue
        }

        // Update transports
        if (detail.transports && detail.transports.length > 0) {
          await db.from('package_transports').delete().eq('package_id', pkg.id)

          for (let i = 0; i < detail.transports.length; i++) {
            const transport = detail.transports[i] as any

            // Extract baggage from segments if not available at transport level
            let baggageInfo = transport.baggageInfo || null
            let checkedBaggage = transport.checkedBaggage || null
            let cabinBaggage = transport.cabinBaggage || null

            // If no baggage info at transport level, try to get from first segment
            if (!baggageInfo && transport.segments?.length > 0) {
              const firstSegmentBaggage = transport.segments[0]?.baggageInfo
              if (firstSegmentBaggage) {
                baggageInfo = firstSegmentBaggage
                if (!checkedBaggage && firstSegmentBaggage) {
                  checkedBaggage = firstSegmentBaggage
                }
              }
            }

            await db.from('package_transports').insert({
              package_id: pkg.id,
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
              baggage_info: baggageInfo,
              checked_baggage: checkedBaggage,
              cabin_baggage: cabinBaggage,
              aircraft_type: transport.aircraftType || null,
              terminal_departure: transport.terminalDeparture || null,
              terminal_arrival: transport.terminalArrival || null,
              num_segments: transport.numSegments || transport.segments?.length || 1,
              net_price: transport.netPrice?.amount || null,
              total_price: transport.totalPrice?.amount || null,
              currency: transport.totalPrice?.currency || 'USD',
              mandatory: transport.mandatory || false,
              is_refundable: true,
              adults_count: transport.adults || info.counters?.adults || 0,
              children_count: transport.children || info.counters?.children || 0,
              infants_count: transport.infants || 0,
              sort_order: i,
            })
          }
        }

        // Update hotels
        if (detail.hotels && detail.hotels.length > 0) {
          await db.from('package_hotels').delete().eq('package_id', pkg.id)

          for (let i = 0; i < detail.hotels.length; i++) {
            const hotel = detail.hotels[i] as any

            await db.from('package_hotels').insert({
              package_id: pkg.id,
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
              adults_count: hotel.adults || info.counters?.adults || 0,
              children_count: hotel.children || info.counters?.children || 0,
              infants_count: hotel.infants || 0,
              sort_order: i,
            })
          }
        }

        results.success++
        console.log(`[Refresh All] Refreshed ${pkg.tc_package_id} (${results.success}/${results.total})`)

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 200))
      } catch (err) {
        results.failed++
        results.errors.push(`Package ${pkg.tc_package_id}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        console.error(`[Refresh All] Failed ${pkg.tc_package_id}:`, err)
      }
    }

    console.log(`[Refresh All] Completed. Success: ${results.success}, Failed: ${results.failed}`)

    return NextResponse.json(results)
  } catch (error) {
    console.error('[Refresh All] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/packages/refresh-all
 * Get status of packages that need transport/hotel data
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    // Get packages in marketing
    const { data: packages, error } = await db
      .from('packages')
      .select(`
        id,
        tc_package_id,
        title,
        transports_count,
        hotels_count,
        package_transports (id),
        package_hotels (id)
      `)
      .eq('tc_active', true)
      .or('status.eq.in_marketing,status.eq.published,send_to_marketing.eq.true')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const withTransportData = packages?.filter(p => (p.package_transports as any[])?.length > 0).length || 0
    const withHotelData = packages?.filter(p => (p.package_hotels as any[])?.length > 0).length || 0
    const needsRefresh = packages?.filter(
      p => (p.transports_count > 0 && (p.package_transports as any[])?.length === 0) ||
           (p.hotels_count > 0 && (p.package_hotels as any[])?.length === 0)
    ).length || 0

    return NextResponse.json({
      total: packages?.length || 0,
      withTransportData,
      withHotelData,
      needsRefresh,
      message: needsRefresh > 0
        ? `${needsRefresh} packages need refresh. POST to this endpoint to refresh all.`
        : 'All packages have transport/hotel data.',
    })
  } catch (error) {
    console.error('[Refresh All] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
