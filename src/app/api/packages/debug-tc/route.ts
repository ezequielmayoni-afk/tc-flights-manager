import { NextRequest, NextResponse } from 'next/server'
import { getPackageDetail } from '@/lib/travelcompositor/client'

/**
 * GET /api/packages/debug-tc?id=43317855
 * Debug endpoint to see raw TC API response for a package
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const packageId = searchParams.get('id')

  if (!packageId) {
    return NextResponse.json({ error: 'Package ID required' }, { status: 400 })
  }

  try {
    const detail = await getPackageDetail(parseInt(packageId))

    // Analyze each transport
    const transportAnalysis = detail.transports?.map((t: any, index: number) => {
      // All fields we expect from TC
      const allFields = {
        // IDs
        id: t.id,
        providerCode: t.providerCode,
        supplierName: t.supplierName,

        // Basic info
        day: t.day,
        transportType: t.transportType,
        direction: t.direction,

        // Company/Flight
        company: t.company,
        transportNumber: t.transportNumber,
        marketingAirlineCode: t.marketingAirlineCode,
        operatingAirlineCode: t.operatingAirlineCode,
        operatingAirlineName: t.operatingAirlineName,

        // Origin/Destination
        'origin.code': t.origin?.code,
        'origin.name': t.origin?.name,
        'destination.code': t.destination?.code,
        'destination.name': t.destination?.name,

        // Dates/times
        departureDate: t.departureDate,
        departureTime: t.departureTime,
        arrivalDate: t.arrivalDate,
        arrivalTime: t.arrivalTime,
        duration: t.duration,
        dayDifference: t.dayDifference,

        // Fare info
        fare: t.fare,
        fareClass: t.fareClass,
        fareBasis: t.fareBasis,
        cabinClass: t.cabinClass,

        // BAGGAGE
        baggageInfo: t.baggageInfo,
        checkedBaggage: t.checkedBaggage,
        cabinBaggage: t.cabinBaggage,

        // Aircraft/Terminal
        aircraftType: t.aircraftType,
        terminalDeparture: t.terminalDeparture,
        terminalArrival: t.terminalArrival,

        // Segments
        numSegments: t.numSegments,
        segmentsCount: t.segments?.length,

        // Prices
        'netPrice.amount': t.netPrice?.amount,
        'totalPrice.amount': t.totalPrice?.amount,
        'totalPrice.currency': t.totalPrice?.currency,

        // Passengers
        adults: t.adults,
        children: t.children,
        infants: t.infants,
        mandatory: t.mandatory,
      }

      // Separate filled and empty
      const filledFields: Record<string, any> = {}
      const emptyFields: string[] = []

      for (const [key, value] of Object.entries(allFields)) {
        if (value === null || value === undefined || value === '') {
          emptyFields.push(key)
        } else {
          filledFields[key] = value
        }
      }

      // Check segments for baggage
      const segmentsBaggage = t.segments?.map((s: any, si: number) => ({
        segmentIndex: si,
        flightNumber: s.flightNumber,
        baggageInfo: s.baggageInfo,
        bookingClass: s.bookingClass,
      }))

      return {
        transportIndex: index,
        direction: t.direction,
        summary: `${t.company || 'N/A'} ${t.transportNumber || 'N/A'} - ${t.origin?.name || 'N/A'} → ${t.destination?.name || 'N/A'}`,
        filledFieldsCount: Object.keys(filledFields).length,
        emptyFieldsCount: emptyFields.length,
        filledFields,
        emptyFields,
        segments: segmentsBaggage,
      }
    })

    return NextResponse.json({
      packageId: parseInt(packageId),
      packageTitle: detail.title,
      transportsCount: detail.transports?.length || 0,
      hotelsCount: detail.hotels?.length || 0,
      transportAnalysis,
      // Raw data for full inspection
      rawTransports: detail.transports,
    })
  } catch (error) {
    console.error('[Debug TC] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching TC data' },
      { status: 500 }
    )
  }
}
