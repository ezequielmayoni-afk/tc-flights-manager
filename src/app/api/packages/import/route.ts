import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getAllPackagesExcludingUsers, getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import type { TCPackageListItem, TCPackageInfoResponse, TCPackageDetailResponse } from '@/lib/travelcompositor/types'
import { generateSEOContent, type PackageDataForSEO } from '@/lib/openai/client'

// Usernames to EXCLUDE from import (import all packages EXCEPT from these users)
const EXCLUDED_USERS = ['Ezequiel Mayoni']

// Supabase client with service role for server operations
function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface ImportStats {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
  errorDetails: Array<{ id: number; title: string; error: string }>
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
      // Get net price from priceBreakdown if available, otherwise use totalPrice
      const price = (transport as any).priceBreakdown?.netProvider?.microsite?.amount
        || transport.totalPrice?.amount
        || 0
      airCost += price

      // Get agency fee
      const fee = (transport as any).priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee

      // Get first flight info
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
 * Map TC package to our database schema with full details
 */
function mapPackageToInsert(
  tcPackage: TCPackageListItem,
  info?: TCPackageInfoResponse,
  costs?: ReturnType<typeof extractCosts>
): Record<string, unknown> {
  return {
    tc_package_id: tcPackage.id,
    title: tcPackage.title,
    large_title: tcPackage.largeTitle || null,
    image_url: tcPackage.imageUrl || null,
    external_reference: tcPackage.externalReference || null,
    tc_creation_date: tcPackage.creationDate || null,
    departure_date: tcPackage.departureDate || null,
    // Date range from info endpoint
    date_range_start: info?.dateSettings?.availRange?.start || null,
    date_range_end: info?.dateSettings?.availRange?.end || null,
    // Prices
    current_price_per_pax: tcPackage.pricePerPerson.amount,
    total_price: tcPackage.totalPrice.amount,
    currency: tcPackage.pricePerPerson.currency || 'USD',
    // Cost breakdown
    air_cost: costs?.airCost || 0,
    land_cost: costs?.landCost || 0,
    agency_fee: costs?.agencyFee || 0,
    // Flight info
    flight_departure_date: costs?.flightDepartureDate || null,
    airline_code: costs?.airlineCode || null,
    airline_name: costs?.airlineName || null,
    flight_numbers: costs?.flightNumbers || null,
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
    // Origin
    origin_code: tcPackage.origin?.location?.code || null,
    origin_name: tcPackage.origin?.location?.name || null,
    origin_country: tcPackage.origin?.location?.country || null,
    // Creator
    created_by_user: tcPackage.user,
    created_by_email: tcPackage.email,
    last_sync_at: new Date().toISOString(),
  }
}

/**
 * Import destinations from a TC package to our database
 */
async function importPackageDestinations(
  db: ReturnType<typeof getSupabaseClient>,
  packageId: number,
  destinations: TCPackageListItem['destinations']
) {
  if (!destinations || destinations.length === 0) return

  // First delete existing destinations
  await db.from('package_destinations').delete().eq('package_id', packageId)

  const destinationsToInsert = destinations.map((dest, index) => ({
    package_id: packageId,
    destination_code: dest.code,
    destination_name: dest.name,
    sort_order: index,
  }))

  await db.from('package_destinations').insert(destinationsToInsert)
}

/**
 * Import transports (flights) from TC package detail to our database
 */
async function importPackageTransports(
  db: ReturnType<typeof getSupabaseClient>,
  packageId: number,
  detail: TCPackageDetailResponse,
  adultsCount: number,
  childrenCount: number
) {
  if (!detail.transports || detail.transports.length === 0) return

  // First delete existing transports
  await db.from('package_transports').delete().eq('package_id', packageId)

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
        // Try to parse baggage info to extract checked/cabin
        // Common formats: "23K", "1PC", "23kg checked", etc.
        if (!checkedBaggage && firstSegmentBaggage) {
          checkedBaggage = firstSegmentBaggage
        }
      }
    }

    const transportRecord = {
      package_id: packageId,
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
      adults_count: transport.adults || adultsCount,
      children_count: transport.children || childrenCount,
      infants_count: transport.infants || 0,
      sort_order: i,
    }

    try {
      await db.from('package_transports').insert(transportRecord)
    } catch (err) {
      console.warn(`[Import] Failed to insert transport for package ${packageId}:`, err)
    }
  }
}

/**
 * Import hotels from TC package detail to our database
 */
async function importPackageHotels(
  db: ReturnType<typeof getSupabaseClient>,
  packageId: number,
  detail: TCPackageDetailResponse,
  adultsCount: number,
  childrenCount: number
) {
  if (!detail.hotels || detail.hotels.length === 0) return

  // First delete existing hotels
  await db.from('package_hotels').delete().eq('package_id', packageId)

  for (let i = 0; i < detail.hotels.length; i++) {
    const hotel = detail.hotels[i] as any
    const hotelData = hotel.hotelData || {}

    const hotelRecord = {
      package_id: packageId,
      tc_hotel_id: hotel.id,
      tc_provider_code: hotel.providerCode || null,
      tc_datasheet_id: hotel.datasheetId || null,
      supplier_name: hotel.supplierName || null,
      day: hotel.day || null,
      hotel_name: hotel.hotelName || hotelData.name || null,
      hotel_category: hotel.hotelCategory || hotelData.category || null,
      destination_code: hotel.destination?.code || null,
      destination_name: hotel.destination?.name || null,
      check_in_date: hotel.checkInDate || null,
      check_out_date: hotel.checkOutDate || null,
      nights: hotel.nights || null,
      room_type: hotel.roomType || hotel.roomTypes || null,
      room_name: hotel.roomName || hotel.roomTypes || null,
      board_type: hotel.boardType || hotel.mealPlan || null,
      board_name: hotel.boardName || hotel.mealPlan || null,
      description: hotelData.description || null,
      image_url: typeof hotelData.images?.[0] === 'string'
        ? hotelData.images[0]
        : hotelData.images?.[0]?.url || null,
      phone: hotelData.phone || null,
      email: hotelData.email || null,
      web_url: hotelData.web || null,
      stars: hotelData.category ? parseInt(hotelData.category) || null : null,
      overall_rating: hotelData.ratings?.overall || null,
      facilities: Array.isArray(hotelData.facilities) && hotelData.facilities.length > 0
        ? hotelData.facilities
        : null,
      cancellation_policy: null,
      net_price: hotel.netPrice?.amount || null,
      total_price: hotel.totalPrice?.amount || null,
      currency: hotel.totalPrice?.currency || 'USD',
      latitude: hotel.latitude || hotelData.geolocation?.latitude || null,
      longitude: hotel.longitude || hotelData.geolocation?.longitude || null,
      address: hotel.address || hotelData.address || null,
      mandatory: hotel.mandatory || false,
      is_refundable: true,
      adults_count: hotel.adults || adultsCount,
      children_count: hotel.children || childrenCount,
      infants_count: hotel.infants || 0,
      sort_order: i,
    }

    try {
      await db.from('package_hotels').insert(hotelRecord)
    } catch (err) {
      console.warn(`[Import] Failed to insert hotel for package ${packageId}:`, err)
    }
  }
}

/**
 * POST /api/packages/import
 * Import all packages from Marcelo Dore from TravelCompositor
 *
 * Options:
 * - fullSync: boolean - If true, fetches full details for each package (slower but more complete)
 * - forceUpdate: boolean - If true, updates existing packages even if they exist
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    // Parse options from request body
    const body = await request.json().catch(() => ({}))
    const fullSync = body.fullSync !== false // Default to true now
    const forceUpdate = body.forceUpdate === true

    console.log(`[Import] Starting import (excluding users: ${EXCLUDED_USERS.join(', ')})`)
    console.log(`[Import] Options: fullSync=${fullSync}, forceUpdate=${forceUpdate}`)

    // Fetch all ACTIVE packages from TC, excluding specified users
    const tcPackages = await getAllPackagesExcludingUsers(EXCLUDED_USERS, { onlyVisible: true })
    console.log(`[Import] Found ${tcPackages.length} packages from TC`)

    // Get existing packages from our DB
    const { data: existingPackages } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax')

    const existingByTcId = new Map<number, { id: number; current_price_per_pax: number }>(
      (existingPackages || []).map(p => [p.tc_package_id, { id: p.id, current_price_per_pax: p.current_price_per_pax }])
    )

    const stats: ImportStats = {
      total: tcPackages.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    }

    // Process each package
    for (const tcPackage of tcPackages) {
      try {
        const existing = existingByTcId.get(tcPackage.id)

        // Fetch additional info for full sync
        let info: TCPackageInfoResponse | undefined
        let detail: TCPackageDetailResponse | undefined
        let costs: ReturnType<typeof extractCosts> | undefined

        if (fullSync) {
          try {
            // Sequential calls: first info, then detail (only if info succeeds)
            info = await getPackageInfo(tcPackage.id)
            if (info) {
              detail = await getPackageDetail(tcPackage.id)
              if (detail) {
                costs = extractCosts(detail)
              }
            }
          } catch (err) {
            console.warn(`[Import] Could not fetch full details for ${tcPackage.id}:`, err)
          }
        }

        if (existing && !forceUpdate) {
          // Package exists, check if price changed
          const oldPrice = existing.current_price_per_pax
          const newPrice = tcPackage.pricePerPerson.amount

          if (oldPrice !== newPrice) {
            // Calculate variance
            const varianceAmount = newPrice - oldPrice
            const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
            const needsManualQuote = Math.abs(variancePct) >= 10

            // Update package with new price, variance, and additional info
            const updateData: Record<string, unknown> = {
              original_price_per_pax: oldPrice,
              current_price_per_pax: newPrice,
              total_price: tcPackage.totalPrice.amount,
              price_variance_pct: variancePct,
              needs_manual_quote: needsManualQuote,
              tc_active: tcPackage.active,
              last_sync_at: new Date().toISOString(),
            }

            // Add full sync data if available
            if (info?.dateSettings?.availRange) {
              updateData.date_range_start = info.dateSettings.availRange.start
              updateData.date_range_end = info.dateSettings.availRange.end
            }
            if (costs) {
              updateData.air_cost = costs.airCost
              updateData.land_cost = costs.landCost
              updateData.agency_fee = costs.agencyFee
              updateData.flight_departure_date = costs.flightDepartureDate
              updateData.airline_code = costs.airlineCode
              updateData.airline_name = costs.airlineName
              updateData.flight_numbers = costs.flightNumbers
            }

            await db
              .from('packages')
              .update(updateData)
              .eq('id', existing.id)

            // Record price history
            await db.from('package_price_history').insert({
              package_id: existing.id,
              price_per_pax: newPrice,
              total_price: tcPackage.totalPrice.amount,
              currency: tcPackage.pricePerPerson.currency || 'USD',
              previous_price: oldPrice,
              variance_amount: varianceAmount,
              variance_pct: variancePct,
            })

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.updated++
            console.log(`[Import] Updated package ${tcPackage.id}: price changed from ${oldPrice} to ${newPrice} (${variancePct.toFixed(2)}%)`)
          } else {
            // Just update sync info and additional data
            const updateData: Record<string, unknown> = {
              tc_active: tcPackage.active,
              last_sync_at: new Date().toISOString(),
            }

            if (info?.dateSettings?.availRange) {
              updateData.date_range_start = info.dateSettings.availRange.start
              updateData.date_range_end = info.dateSettings.availRange.end
            }
            if (costs) {
              updateData.air_cost = costs.airCost
              updateData.land_cost = costs.landCost
              updateData.agency_fee = costs.agencyFee
              updateData.flight_departure_date = costs.flightDepartureDate
              updateData.airline_code = costs.airlineCode
              updateData.airline_name = costs.airlineName
              updateData.flight_numbers = costs.flightNumbers
            }

            await db
              .from('packages')
              .update(updateData)
              .eq('id', existing.id)

            // Import transports and hotels if detail available (even if price didn't change)
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.skipped++
          }
        } else {
          // New package or force update
          const packageData = mapPackageToInsert(tcPackage, info, costs)

          if (existing && forceUpdate) {
            // Update existing package
            await db
              .from('packages')
              .update(packageData)
              .eq('id', existing.id)

            // Update destinations
            await importPackageDestinations(db, existing.id, tcPackage.destinations)

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.updated++
            console.log(`[Import] Force updated package ${tcPackage.id}: ${tcPackage.title}`)
          } else {
            // Insert new package
            packageData.original_price_per_pax = tcPackage.pricePerPerson.amount
            packageData.status = 'imported'

            const { data: newPackage, error: insertError } = await db
              .from('packages')
              .insert(packageData)
              .select('id')
              .single()

            if (insertError) {
              throw new Error(insertError.message)
            }

            // Import destinations
            await importPackageDestinations(db, newPackage.id, tcPackage.destinations)

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            // Record initial price history
            await db.from('package_price_history').insert({
              package_id: newPackage.id,
              price_per_pax: tcPackage.pricePerPerson.amount,
              total_price: tcPackage.totalPrice.amount,
              currency: tcPackage.pricePerPerson.currency || 'USD',
            })

            // Generate SEO content for new packages
            try {
              const { data: configData } = await db
                .from('seo_prompt_config')
                .select('prompt_template')
                .order('id', { ascending: false })
                .limit(1)
                .single()

              if (configData?.prompt_template) {
                const destinationNames = tcPackage.destinations?.map(d => d.name).join(', ') || ''
                // Note: TCPackageListItem doesn't include hotel/transport details
                // Those would need to be fetched separately via package detail endpoint
                const seoPackageData: PackageDataForSEO = {
                  // Basic info
                  title: tcPackage.title,
                  large_title: tcPackage.largeTitle || null,
                  destinations: destinationNames,
                  price: tcPackage.pricePerPerson.amount,
                  currency: tcPackage.pricePerPerson.currency || 'USD',
                  nights: tcPackage.counters?.hotelNights || 0,
                  adults: tcPackage.counters?.adults || 2,
                  children: tcPackage.counters?.children || 0,
                  departure_date: tcPackage.departureDate || null,
                  date_range: null, // Not available in list endpoint
                  themes: tcPackage.themes || [],
                  // Origin
                  origin_city: tcPackage.origin?.location?.name || null,
                  origin_country: tcPackage.origin?.location?.country || null,
                  // Hotel info (not available in list endpoint)
                  hotel_name: null,
                  hotel_category: null,
                  hotel_stars: null,
                  room_type: null,
                  board_type: null,
                  hotel_nights: tcPackage.counters?.hotelNights || null,
                  hotel_address: null,
                  // Flight info
                  airline: costs?.airlineName || null,
                  airline_code: null,
                  flight_departure: null,
                  flight_arrival: null,
                  cabin_class: null,
                  baggage_info: null,
                  // Counts
                  hotels_count: tcPackage.counters?.hotels || 0,
                  transfers_count: tcPackage.counters?.transfers || 0,
                  flights_count: tcPackage.counters?.transports || 0,
                  // Inclusions
                  includes_flights: (tcPackage.counters?.transports || 0) > 0,
                  includes_hotel: (tcPackage.counters?.hotels || 0) > 0,
                  includes_transfers: (tcPackage.counters?.transfers || 0) > 0,
                  includes_all_inclusive: false, // Not determinable from list endpoint
                }

                const seoContent = await generateSEOContent(seoPackageData, configData.prompt_template)

                await db
                  .from('packages')
                  .update({
                    seo_title: seoContent.seo_title,
                    seo_description: seoContent.seo_description,
                    seo_keywords: seoContent.seo_keywords,
                    meta_title: seoContent.meta_title,
                    meta_description: seoContent.meta_description,
                    image_alt: seoContent.image_alt,
                    seo_status: 'generated',
                    seo_generated_at: new Date().toISOString(),
                  })
                  .eq('id', newPackage.id)
              }
            } catch (seoError) {
              console.warn(`[Import] SEO generation failed for ${tcPackage.id}:`, seoError)
            }

            stats.imported++
            console.log(`[Import] Imported new package ${tcPackage.id}: ${tcPackage.title}`)
          }
        }
      } catch (error) {
        stats.errors++
        stats.errorDetails.push({
          id: tcPackage.id,
          title: tcPackage.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        console.error(`[Import] Error processing package ${tcPackage.id}:`, error)
      }
    }

    console.log(`[Import] Complete. Imported: ${stats.imported}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`)

    return NextResponse.json({
      success: true,
      message: `Import completed (excluded: ${EXCLUDED_USERS.join(', ')})`,
      stats,
    })
  } catch (error) {
    console.error('[Import] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/packages/import
 * Get import status and stats
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    // Get counts and stats
    const { count: totalCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })

    const { count: activeCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('tc_active', true)

    const { count: needsQuoteCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('needs_manual_quote', true)

    const { data: lastSync } = await db
      .from('packages')
      .select('last_sync_at')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .single()

    // Get packages by status
    const { data: statusCounts } = await db
      .from('packages')
      .select('status')

    const statusBreakdown = (statusCounts || []).reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      excludedUsers: EXCLUDED_USERS,
      stats: {
        total: totalCount || 0,
        active: activeCount || 0,
        needsManualQuote: needsQuoteCount || 0,
        lastSyncAt: lastSync?.last_sync_at || null,
        byStatus: statusBreakdown,
      },
    })
  } catch (error) {
    console.error('[Import] Error getting stats:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
