import type { TCPackageListItem, TCPackageInfoResponse, TCPackageDetailResponse } from '@/lib/travelcompositor/types'
import { getAllPackagesExcludingUsers, getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

// Usuarios cuyos paquetes NO se importan (se importa todo EXCEPTO los de estos usuarios)
export const EXCLUDED_USERS = ['Ezequiel Mayoni']


/**
 * Extract cost breakdown from package detail
 */
export function extractCosts(detail: TCPackageDetailResponse): {
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
export function mapPackageToInsert(
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
export async function importPackageDestinations(
  db: Db,
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
export async function importPackageTransports(
  db: Db,
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
export async function importPackageHotels(
  db: Db,
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

export interface NewPackagesResult {
  tcTotal: number
  detected: number
  imported: number
  errors: Array<{ id: number; title: string; error: string }>
}

/**
 * Importa los paquetes que existen en TC y todavía no están en hub.
 *
 * NO genera contenido SEO: los paquetes entran con seo_status 'pending' para
 * completarlos a mano desde la sección de SEO. La generación automática con IA
 * sigue viviendo solo en el import manual (/api/packages/import).
 */
export async function importNewPackages(
  db: Db,
  options: { limit?: number; shouldStop?: () => boolean } = {}
): Promise<NewPackagesResult> {
  const { limit = Infinity, shouldStop } = options

  const tcPackages = await getAllPackagesExcludingUsers(EXCLUDED_USERS, { onlyVisible: true })

  const { data: existingPackages } = await db.from('packages').select('tc_package_id')
  const existingIds = new Set((existingPackages || []).map(p => p.tc_package_id))

  const newPackages = tcPackages.filter(p => !existingIds.has(p.id))
  const result: NewPackagesResult = {
    tcTotal: tcPackages.length,
    detected: newPackages.length,
    imported: 0,
    errors: [],
  }

  for (const tcPackage of newPackages) {
    if (result.imported >= limit || shouldStop?.()) break

    try {
      let info: TCPackageInfoResponse | undefined
      let detail: TCPackageDetailResponse | undefined
      let costs: ReturnType<typeof extractCosts> | undefined

      try {
        info = await getPackageInfo(tcPackage.id)
        if (info) {
          detail = await getPackageDetail(tcPackage.id)
          if (detail) costs = extractCosts(detail)
        }
      } catch (err) {
        console.warn(`[ImportNew] Sin detalle para ${tcPackage.id}:`, err)
      }

      const packageData = mapPackageToInsert(tcPackage, info, costs)
      packageData.original_price_per_pax = tcPackage.pricePerPerson.amount
      packageData.status = 'imported'
      packageData.seo_status = 'pending'

      const { data: newPackage, error: insertError } = await db
        .from('packages')
        .insert(packageData)
        .select('id')
        .single()

      if (insertError) throw new Error(insertError.message)

      await importPackageDestinations(db, newPackage.id, tcPackage.destinations)

      if (detail) {
        await importPackageTransports(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
        await importPackageHotels(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
      }

      await db.from('package_price_history').insert({
        package_id: newPackage.id,
        price_per_pax: tcPackage.pricePerPerson.amount,
        total_price: tcPackage.totalPrice.amount,
        currency: tcPackage.pricePerPerson.currency || 'USD',
      })

      result.imported++
      console.log(`[ImportNew] Importado ${tcPackage.id}: ${tcPackage.title}`)
    } catch (error) {
      result.errors.push({
        id: tcPackage.id,
        title: tcPackage.title,
        error: error instanceof Error ? error.message : 'Unknown error',
      })
      console.error(`[ImportNew] Error importando ${tcPackage.id}:`, error)
    }
  }

  return result
}
