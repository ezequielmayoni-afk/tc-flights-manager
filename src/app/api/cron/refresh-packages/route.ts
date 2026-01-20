import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import type { TCPackageDetailResponse } from '@/lib/travelcompositor/types'

// Vercel cron jobs have a 60s timeout on hobby, 300s on pro
// We process packages in batches to stay within limits
const BATCH_SIZE = 10
const DELAY_BETWEEN_PACKAGES = 500 // ms

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

  // Sum transport costs (air)
  if (detail.transports && detail.transports.length > 0) {
    for (const transport of detail.transports) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transportAny = transport as any
      const price = transportAny.priceBreakdown?.netProvider?.microsite?.amount
        || transport.totalPrice?.amount
        || 0
      airCost += price

      const fee = transportAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hotelAny = hotel as any
      const price = hotelAny.priceBreakdown?.netProvider?.microsite?.amount
        || hotel.totalPrice?.amount
        || 0
      landCost += price
      const fee = hotelAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum transfer costs
  if (detail.transfers && detail.transfers.length > 0) {
    for (const transfer of detail.transfers) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transferAny = transfer as any
      const price = transferAny.priceBreakdown?.netProvider?.microsite?.amount
        || transfer.totalPrice?.amount
        || 0
      landCost += price
      const fee = transferAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum closed tour costs
  if (detail.closedTours && detail.closedTours.length > 0) {
    for (const tour of detail.closedTours) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tourAny = tour as any
      const price = tourAny.priceBreakdown?.netProvider?.microsite?.amount
        || tour.totalPrice?.amount
        || 0
      landCost += price
      const fee = tourAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum ticket costs
  if (detail.tickets && detail.tickets.length > 0) {
    for (const ticket of detail.tickets) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ticketAny = ticket as any
      const price = ticketAny.priceBreakdown?.netProvider?.microsite?.amount
        || ticket.totalPrice?.amount
        || 0
      landCost += price
      const fee = ticketAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
      agencyFee += fee
    }
  }

  // Sum car costs
  if (detail.cars && detail.cars.length > 0) {
    for (const car of detail.cars) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const carAny = car as any
      const price = carAny.priceBreakdown?.netProvider?.microsite?.amount
        || car.totalPrice?.amount
        || 0
      landCost += price
      const fee = carAny.priceBreakdown?.agencyFee?.microsite?.amount || 0
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

async function refreshPackage(db: ReturnType<typeof getSupabaseClient>, pkg: {
  id: number
  tc_package_id: number
  current_price_per_pax: number
}): Promise<{ success: boolean; priceChanged: boolean; error?: string }> {
  try {
    const [info, detail] = await Promise.all([
      getPackageInfo(pkg.tc_package_id),
      getPackageDetail(pkg.tc_package_id),
    ])

    if (!info) {
      return { success: false, priceChanged: false, error: 'Package not found in TC' }
    }

    const tcPackage = info
    const costs = extractCosts(detail)
    const oldPrice = pkg.current_price_per_pax
    const newPrice = tcPackage.pricePerPerson.amount

    // Calculate price variance
    const varianceAmount = newPrice - oldPrice
    const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
    const needsManualQuote = Math.abs(variancePct) >= 5

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

    // If price changed, record original price, timestamp and history
    if (oldPrice !== newPrice) {
      updateData.original_price_per_pax = oldPrice
      updateData.last_price_change_at = new Date().toISOString()

      await db.from('package_price_history').insert({
        package_id: pkg.id,
        price_per_pax: newPrice,
        total_price: tcPackage.totalPrice.amount,
        currency: tcPackage.pricePerPerson.currency || 'USD',
        previous_price: oldPrice,
        variance_amount: varianceAmount,
        variance_pct: variancePct,
      })
    }

    // Update package
    const { error: updateError } = await db
      .from('packages')
      .update(updateData)
      .eq('id', pkg.id)

    if (updateError) {
      return { success: false, priceChanged: false, error: updateError.message }
    }

    // Update destinations
    if (tcPackage.destinations && tcPackage.destinations.length > 0) {
      await db.from('package_destinations').delete().eq('package_id', pkg.id)

      const destinationsToInsert = tcPackage.destinations.map((dest, index) => ({
        package_id: pkg.id,
        destination_code: dest.code,
        destination_name: dest.name,
        sort_order: index,
      }))

      await db.from('package_destinations').insert(destinationsToInsert)
    }

    return { success: true, priceChanged: oldPrice !== newPrice }
  } catch (error) {
    return {
      success: false,
      priceChanged: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * GET /api/cron/refresh-packages
 * Cron job to refresh all active packages from TravelCompositor
 * Runs daily at 6:00 AM UTC (3:00 AM Argentina time)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // FIX: Si CRON_SECRET no está configurado, rechazar (antes se bypasseaba)
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Cron] Intento de acceso no autorizado', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getSupabaseClient()
  const startTime = Date.now()

  console.log('[Cron] Starting daily package refresh...')

  try {
    // Get all active packages that haven't expired
    const today = new Date().toISOString().split('T')[0]
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax')
      .eq('tc_active', true)
      .or(`date_range_end.is.null,date_range_end.gte.${today}`)
      .order('last_sync_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE)

    if (fetchError) {
      console.error('[Cron] Error fetching packages:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!packages || packages.length === 0) {
      console.log('[Cron] No packages to refresh')
      return NextResponse.json({
        success: true,
        message: 'No packages to refresh',
        processed: 0,
      })
    }

    console.log(`[Cron] Processing ${packages.length} packages...`)

    const results = {
      processed: 0,
      successCount: 0,
      failed: 0,
      priceChanges: 0,
      errors: [] as { id: number; tc_id: number; error: string }[],
    }

    for (const pkg of packages) {
      const result = await refreshPackage(db, pkg)
      results.processed++

      if (result.success) {
        results.successCount++
        if (result.priceChanged) {
          results.priceChanges++
        }
      } else {
        results.failed++
        results.errors.push({
          id: pkg.id,
          tc_id: pkg.tc_package_id,
          error: result.error || 'Unknown error',
        })
      }

      // Add delay between packages to avoid rate limiting
      if (results.processed < packages.length) {
        await sleep(DELAY_BETWEEN_PACKAGES)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`[Cron] Completed in ${duration}s: ${results.successCount}/${results.processed} success, ${results.priceChanges} price changes`)

    // Log to sync_logs table
    await db.from('package_sync_logs').insert({
      package_id: null,
      sync_type: 'cron_batch',
      status: results.failed === 0 ? 'success' : 'partial',
      details: {
        processed: results.processed,
        successCount: results.successCount,
        failed: results.failed,
        priceChanges: results.priceChanges,
        duration: `${duration}s`,
        errors: results.errors,
      },
    })

    return NextResponse.json({
      success: results.failed === 0,
      ...results,
      duration: `${duration}s`,
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export { GET as POST }
