import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import type {
  TCPackageDetailResponse,
  TCServicePriceBreakdown,
} from '@/lib/travelcompositor/types'
import { generateSEOContent, type PackageDataForSEO } from '@/lib/openai/client'

/**
 * Extract price breakdown values from TC service
 */
function extractPriceBreakdown(priceBreakdown?: TCServicePriceBreakdown) {
  return {
    netProvider: priceBreakdown?.netProvider?.microsite?.amount || 0,
    operatorFee: priceBreakdown?.operatorFee?.microsite?.amount || 0,
    agencyFee: priceBreakdown?.agencyFee?.microsite?.amount || 0,
    commission: priceBreakdown?.commission?.microsite?.amount || 0,
    taxes: priceBreakdown?.taxes?.microsite?.amount || 0,
  }
}

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
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

interface ImportResult {
  packageId: number
  success: boolean
  isUpdate: boolean
  error?: string
  title?: string
}

async function importSinglePackage(
  db: ReturnType<typeof getSupabaseClient>,
  packageId: number
): Promise<ImportResult> {
  try {
    console.log(`[Import Batch] Importing package: ${packageId}`)

    // Check if package already exists
    const { data: existing } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax')
      .eq('tc_package_id', packageId)
      .single()

    // Fetch package info and detail from TC
    let info, detail
    try {
      info = await getPackageInfo(packageId)
      detail = await getPackageDetail(packageId)
    } catch (err) {
      console.error(`[Import Batch] Error fetching package ${packageId}:`, err)
      return {
        packageId,
        success: false,
        isUpdate: false,
        error: `No se pudo obtener el paquete de TravelCompositor`,
      }
    }

    const costs = extractCosts(detail)

    const pricePerPax = info?.pricePerPerson?.amount || detail.pricePerPerson?.amount || 0
    const totalPrice = info?.totalPrice?.amount || detail.totalPrice?.amount || 0
    const currency = info?.pricePerPerson?.currency || detail.pricePerPerson?.currency || 'USD'

    const packageData = {
      tc_package_id: packageId,
      title: info?.title || detail.title || `Paquete ${packageId}`,
      large_title: info?.largeTitle || detail.largeTitle || null,
      image_url: info?.imageUrl || detail.imageUrl || null,
      external_reference: info?.externalReference || detail.externalReference || null,
      tc_creation_date: info?.creationDate || detail.creationDate || null,
      departure_date: info?.departureDate || detail.departureDate || null,
      date_range_start: info?.dateSettings?.availRange?.start || null,
      date_range_end: info?.dateSettings?.availRange?.end || null,
      current_price_per_pax: pricePerPax,
      original_price_per_pax: pricePerPax,
      total_price: totalPrice,
      currency: currency,
      air_cost: costs.airCost,
      land_cost: costs.landCost,
      agency_fee: costs.agencyFee,
      flight_departure_date: costs.flightDepartureDate,
      airline_code: costs.airlineCode,
      airline_name: costs.airlineName,
      flight_numbers: costs.flightNumbers,
      adults_count: info?.counters?.adults ?? detail.counters?.adults ?? 0,
      children_count: info?.counters?.children ?? detail.counters?.children ?? 0,
      nights_count: info?.counters?.hotelNights ?? detail.counters?.hotelNights ?? 0,
      destinations_count: info?.counters?.destinations ?? detail.counters?.destinations ?? 0,
      transports_count: info?.counters?.transports ?? detail.counters?.transports ?? 0,
      hotels_count: info?.counters?.hotels ?? detail.counters?.hotels ?? 0,
      transfers_count: info?.counters?.transfers ?? detail.counters?.transfers ?? 0,
      cars_count: info?.counters?.cars ?? detail.counters?.cars ?? 0,
      tickets_count: info?.counters?.tickets ?? detail.counters?.tickets ?? 0,
      tours_count: info?.counters?.closedTours ?? detail.counters?.closedTours ?? 0,
      tc_active: info?.active ?? detail.active ?? true,
      themes: info?.themes || detail.themes || [],
      tc_idea_url: info?.ideaUrl || detail.ideaUrl || null,
      origin_code: info?.origin?.location?.code || detail.origin?.location?.code || null,
      origin_name: info?.origin?.location?.name || detail.origin?.location?.name || null,
      origin_country: info?.origin?.location?.country || detail.origin?.location?.country || null,
      created_by_user: info?.user || detail.user || 'Manual Import',
      created_by_email: info?.email || detail.email || null,
      status: 'imported',
      last_sync_at: new Date().toISOString(),
    }

    let finalPackageId: number
    let isUpdate = false

    if (existing) {
      isUpdate = true
      finalPackageId = existing.id
      const oldPrice = existing.current_price_per_pax

      const varianceAmount = pricePerPax - oldPrice
      const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
      const needsManualQuote = Math.abs(variancePct) >= 10

      const updateData = {
        ...packageData,
        original_price_per_pax: oldPrice,
        price_variance_pct: variancePct,
        needs_manual_quote: needsManualQuote,
      }

      const { error: updateError } = await db
        .from('packages')
        .update(updateData)
        .eq('id', existing.id)

      if (updateError) {
        return {
          packageId,
          success: false,
          isUpdate: true,
          error: updateError.message,
        }
      }

      // Delete existing related data before re-importing
      await Promise.all([
        db.from('package_destinations').delete().eq('package_id', existing.id),
        db.from('package_hotels').delete().eq('package_id', existing.id),
        db.from('package_transports').delete().eq('package_id', existing.id),
        db.from('package_transfers').delete().eq('package_id', existing.id),
        db.from('package_service_prices').delete().eq('package_id', existing.id),
      ])

      if (oldPrice !== pricePerPax) {
        await db.from('package_price_history').insert({
          package_id: existing.id,
          price_per_pax: pricePerPax,
          total_price: totalPrice,
          currency: currency,
          previous_price: oldPrice,
          variance_amount: varianceAmount,
          variance_pct: variancePct,
        })
      }
    } else {
      const { data: newPackage, error: insertError } = await db
        .from('packages')
        .insert(packageData)
        .select('id')
        .single()

      if (insertError) {
        return {
          packageId,
          success: false,
          isUpdate: false,
          error: insertError.message,
        }
      }

      finalPackageId = newPackage.id

      await db.from('package_price_history').insert({
        package_id: newPackage.id,
        price_per_pax: pricePerPax,
        total_price: totalPrice,
        currency: currency,
      })
    }

    // Import destinations
    if (detail.destinations && detail.destinations.length > 0) {
      const destinationsToInsert = detail.destinations.map((dest: any, index: number) => ({
        package_id: finalPackageId,
        destination_code: dest.location?.code || dest.code,
        destination_name: dest.location?.name || dest.name,
        country: dest.location?.country || null,
        country_code: null,
        from_day: dest.dayFrom || null,
        to_day: dest.dayTo || null,
        nights: dest.dayTo && dest.dayFrom ? dest.dayTo - dest.dayFrom : null,
        latitude: dest.location?.geolocation?.latitude || null,
        longitude: dest.location?.geolocation?.longitude || null,
        description: dest.location?.description || null,
        sort_order: index,
      }))
      await db.from('package_destinations').insert(destinationsToInsert)
    }

    // Import hotels
    if (detail.hotels && detail.hotels.length > 0) {
      for (let i = 0; i < detail.hotels.length; i++) {
        const hotel = detail.hotels[i] as any
        const hotelData = hotel.hotelData || {}
        const priceBreakdown = extractPriceBreakdown(hotel.priceBreakdown)

        const hotelRecord = {
          package_id: finalPackageId,
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
          adults_count: hotel.adults || packageData.adults_count,
          children_count: hotel.children || packageData.children_count,
          infants_count: hotel.infants || 0,
          sort_order: i,
        }

        const { data: insertedHotel, error: hotelError } = await db
          .from('package_hotels')
          .insert(hotelRecord)
          .select('id')
          .single()

        if (hotelError) continue

        // Insert hotel images
        if (hotelData.images && hotelData.images.length > 0) {
          const hotelImages = hotelData.images.map((img: any, imgIndex: number) => ({
            hotel_id: insertedHotel.id,
            image_url: typeof img === 'string' ? img : img?.url || '',
            width: typeof img === 'object' ? img?.width : null,
            height: typeof img === 'object' ? img?.height : null,
            sort_order: imgIndex,
          })).filter((img: any) => img.image_url)
          if (hotelImages.length > 0) {
            await db.from('package_hotel_images').insert(hotelImages)
          }
        }

        // Insert service price breakdown
        if (priceBreakdown.netProvider > 0) {
          await db.from('package_service_prices').insert({
            package_id: finalPackageId,
            service_type: 'hotel',
            service_id: insertedHotel.id,
            net_provider: priceBreakdown.netProvider,
            operator_fee: priceBreakdown.operatorFee,
            agency_fee: priceBreakdown.agencyFee,
            commission: priceBreakdown.commission,
            taxes: priceBreakdown.taxes,
            final_price: hotel.totalPrice?.amount || 0,
            currency: hotel.totalPrice?.currency || 'USD',
          })
        }
      }
    }

    // Import transports
    if (detail.transports && detail.transports.length > 0) {
      for (let i = 0; i < detail.transports.length; i++) {
        const transport = detail.transports[i] as any
        const priceBreakdown = extractPriceBreakdown(transport.priceBreakdown)

        let baggageInfo = transport.baggageInfo || null
        let checkedBaggage = transport.checkedBaggage || null
        let cabinBaggage = transport.cabinBaggage || null

        if (!baggageInfo && transport.segments?.length > 0) {
          const firstSegmentBaggage = transport.segments[0]?.baggageInfo
          if (firstSegmentBaggage) {
            baggageInfo = firstSegmentBaggage
            if (!checkedBaggage && firstSegmentBaggage) {
              checkedBaggage = firstSegmentBaggage
            }
          }
        }

        const transportRecord = {
          package_id: finalPackageId,
          tc_transport_id: transport.id,
          tc_provider_code: transport.providerCode || null,
          supplier_name: transport.supplier || transport.supplierName || null,
          day: transport.day || null,
          transport_type: transport.transportType || 'PLANE',
          direction: transport.direction || null,
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
          adults_count: transport.adults || packageData.adults_count,
          children_count: transport.children || packageData.children_count,
          infants_count: transport.infants || 0,
          sort_order: i,
        }

        const { data: insertedTransport, error: transportError } = await db
          .from('package_transports')
          .insert(transportRecord)
          .select('id')
          .single()

        if (transportError) continue

        // Insert transport segments
        if (transport.segments && transport.segments.length > 0) {
          const segments = transport.segments.map((seg: any, segIndex: number) => ({
            transport_id: insertedTransport.id,
            departure_airport: seg.departureAirport || null,
            departure_airport_name: seg.departureAirportName || null,
            arrival_airport: seg.arrivalAirport || null,
            arrival_airport_name: seg.arrivalAirportName || null,
            departure_datetime: seg.departureTime || null,
            arrival_datetime: seg.arrivalTime || null,
            flight_number: seg.flightNumber || null,
            marketing_airline: seg.marketingAirline || null,
            operating_airline: seg.operatingAirline || null,
            booking_class: seg.bookingClass || null,
            cabin_class: seg.cabinClass || null,
            baggage_info: seg.baggageInfo || null,
            sort_order: segIndex,
          }))
          await db.from('package_transport_segments').insert(segments)
        }

        // Insert service price breakdown
        if (priceBreakdown.netProvider > 0) {
          await db.from('package_service_prices').insert({
            package_id: finalPackageId,
            service_type: 'transport',
            service_id: insertedTransport.id,
            net_provider: priceBreakdown.netProvider,
            operator_fee: priceBreakdown.operatorFee,
            agency_fee: priceBreakdown.agencyFee,
            commission: priceBreakdown.commission,
            taxes: priceBreakdown.taxes,
            final_price: transport.totalPrice?.amount || 0,
            currency: transport.totalPrice?.currency || 'USD',
          })
        }
      }
    }

    // Import transfers
    if (detail.transfers && detail.transfers.length > 0) {
      for (let i = 0; i < detail.transfers.length; i++) {
        const transfer = detail.transfers[i] as any
        const priceBreakdown = extractPriceBreakdown(transfer.priceBreakdown)

        const transferRecord = {
          package_id: finalPackageId,
          tc_transfer_id: transfer.id,
          tc_provider_code: transfer.providerCode || null,
          supplier_name: transfer.supplierName || null,
          day: transfer.day || null,
          transfer_type: transfer.transferType || null,
          from_name: transfer.fromName || null,
          from_latitude: transfer.fromLatitude || null,
          from_longitude: transfer.fromLongitude || null,
          to_name: transfer.toName || null,
          to_latitude: transfer.toLatitude || null,
          to_longitude: transfer.toLongitude || null,
          vehicle_type: transfer.vehicleType || null,
          service_type: transfer.serviceType || null,
          product_type: transfer.productType || null,
          datetime: transfer.datetime || null,
          duration_minutes: transfer.durationMinutes || null,
          description: transfer.description || null,
          image_url: transfer.imageUrl || null,
          net_price: transfer.netPrice?.amount || null,
          total_price: transfer.totalPrice?.amount || null,
          currency: transfer.totalPrice?.currency || 'USD',
          mandatory: transfer.mandatory || false,
          adults_count: transfer.adults || packageData.adults_count,
          children_count: transfer.children || packageData.children_count,
          infants_count: transfer.infants || 0,
          sort_order: i,
        }

        const { data: insertedTransfer, error: transferError } = await db
          .from('package_transfers')
          .insert(transferRecord)
          .select('id')
          .single()

        if (transferError) continue

        // Insert service price breakdown
        if (priceBreakdown.netProvider > 0) {
          await db.from('package_service_prices').insert({
            package_id: finalPackageId,
            service_type: 'transfer',
            service_id: insertedTransfer.id,
            net_provider: priceBreakdown.netProvider,
            operator_fee: priceBreakdown.operatorFee,
            agency_fee: priceBreakdown.agencyFee,
            commission: priceBreakdown.commission,
            taxes: priceBreakdown.taxes,
            final_price: transfer.totalPrice?.amount || 0,
            currency: transfer.totalPrice?.currency || 'USD',
          })
        }
      }
    }

    // Generate SEO content
    try {
      const { data: configData } = await db
        .from('seo_prompt_config')
        .select('prompt_template')
        .order('id', { ascending: false })
        .limit(1)
        .single()

      if (configData?.prompt_template) {
        const destinationNames = detail.destinations?.map((d: any) => d.location?.name || d.name).join(', ') || ''
        const firstHotel = detail.hotels?.[0] as any
        const hotelData = firstHotel?.hotelData || {}
        const firstTransport = detail.transports?.[0] as any
        const boardType = firstHotel?.boardType || firstHotel?.mealPlan || ''
        const isAllInclusive = boardType.toUpperCase().includes('ALL INCLUSIVE') ||
          boardType.toUpperCase().includes('TODO INCLUIDO')
        const dateRange = packageData.date_range_start && packageData.date_range_end
          ? `${packageData.date_range_start} - ${packageData.date_range_end}`
          : null

        const seoPackageData: PackageDataForSEO = {
          title: packageData.title,
          large_title: packageData.large_title,
          destinations: destinationNames,
          price: pricePerPax,
          currency: currency,
          nights: packageData.nights_count,
          adults: packageData.adults_count,
          children: packageData.children_count,
          departure_date: packageData.departure_date,
          date_range: dateRange,
          themes: packageData.themes as string[],
          origin_city: packageData.origin_name,
          origin_country: packageData.origin_country,
          hotel_name: firstHotel?.hotelName || hotelData?.name || null,
          hotel_category: firstHotel?.hotelCategory || null,
          hotel_stars: hotelData?.category ? parseInt(hotelData.category) : null,
          room_type: firstHotel?.roomType || firstHotel?.roomTypes || null,
          board_type: boardType || null,
          hotel_nights: firstHotel?.nights || null,
          hotel_address: firstHotel?.address || hotelData?.address || null,
          airline: packageData.airline_name,
          airline_code: packageData.airline_code,
          flight_departure: firstTransport?.departureDate || null,
          flight_arrival: firstTransport?.arrivalDate || null,
          cabin_class: firstTransport?.cabinClass || null,
          baggage_info: firstTransport?.baggageInfo || firstTransport?.checkedBaggage || null,
          hotels_count: packageData.hotels_count,
          transfers_count: packageData.transfers_count,
          flights_count: packageData.transports_count,
          includes_flights: packageData.transports_count > 0,
          includes_hotel: packageData.hotels_count > 0,
          includes_transfers: packageData.transfers_count > 0,
          includes_all_inclusive: isAllInclusive,
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
          .eq('id', finalPackageId)

        // Start SEO upload bot in background
        try {
          const botPath = path.resolve(process.cwd(), '..', 'tc-requote-bot')
          const botProcess = spawn('npm', ['run', 'seo:manual', '--', String(packageId)], {
            cwd: botPath,
            shell: true,
            detached: true,
            stdio: 'ignore',
          })
          botProcess.unref()
        } catch (botError) {
          console.warn(`[Import Batch] Failed to start SEO upload bot for package ${packageId}`)
        }
      }
    } catch (seoError) {
      console.warn(`[Import Batch] SEO generation failed for package ${packageId}`)
    }

    console.log(`[Import Batch] Successfully ${isUpdate ? 'updated' : 'imported'} package ${packageId}`)

    return {
      packageId,
      success: true,
      isUpdate,
      title: packageData.title,
    }
  } catch (error) {
    console.error(`[Import Batch] Error importing package ${packageId}:`, error)
    return {
      packageId,
      success: false,
      isUpdate: false,
      error: error instanceof Error ? error.message : 'Error desconocido',
    }
  }
}

/**
 * POST /api/packages/import-batch
 * Import multiple packages by TC IDs
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const packageIds: number[] = body.packageIds

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Se requiere un array de IDs de paquetes' },
        { status: 400 }
      )
    }

    // Validate all IDs are numbers
    const validIds = packageIds.filter(id => !isNaN(Number(id))).map(Number)
    if (validIds.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No se encontraron IDs válidos' },
        { status: 400 }
      )
    }

    console.log(`[Import Batch] Starting import of ${validIds.length} packages...`)

    const results: ImportResult[] = []
    let imported = 0
    let updated = 0
    let failed = 0

    // Import packages sequentially to avoid rate limiting
    for (const packageId of validIds) {
      const result = await importSinglePackage(db, packageId)
      results.push(result)

      if (result.success) {
        if (result.isUpdate) {
          updated++
        } else {
          imported++
        }
      } else {
        failed++
      }

      // Small delay between requests to avoid overwhelming the TC API
      await new Promise(resolve => setTimeout(resolve, 500))
    }

    console.log(`[Import Batch] Completed. Imported: ${imported}, Updated: ${updated}, Failed: ${failed}`)

    return NextResponse.json({
      success: true,
      summary: {
        total: validIds.length,
        imported,
        updated,
        failed,
      },
      results,
    })
  } catch (error) {
    console.error('[Import Batch] Fatal error:', error)
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Error desconocido' },
      { status: 500 }
    )
  }
}
