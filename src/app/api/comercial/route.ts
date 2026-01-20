import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import type { PackageForComercial } from '@/types/comercial'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/comercial
 * Fetch packages for the comercial dashboard with all related data and cupos
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const searchParams = request.nextUrl.searchParams

  const search = searchParams.get('search')
  const destination = searchParams.get('destination')
  const dateFrom = searchParams.get('dateFrom')
  const dateTo = searchParams.get('dateTo')

  try {
    // Build query for packages
    let query = db
      .from('packages')
      .select(`
        id,
        tc_package_id,
        title,
        image_url,
        departure_date,
        date_range_start,
        date_range_end,
        air_cost,
        land_cost,
        agency_fee,
        current_price_per_pax,
        currency,
        adults_count,
        children_count,
        infants_count,
        nights_count,
        transports_count,
        hotels_count,
        tc_active,
        status,
        package_destinations (
          destination_code,
          destination_name
        ),
        package_transports (
          tc_transport_id,
          transport_number,
          marketing_airline_code,
          company,
          departure_date,
          arrival_date,
          departure_time,
          arrival_time,
          origin_name,
          destination_name,
          baggage_info,
          checked_baggage,
          cabin_baggage
        ),
        package_hotels (
          hotel_name,
          room_type,
          room_name,
          board_type,
          board_name,
          nights,
          check_in_date,
          check_out_date
        )
      `)
      .eq('tc_active', true)
      .or('status.eq.in_marketing,status.eq.published,send_to_marketing.eq.true')
      .order('date_range_start', { ascending: true })

    // Apply search filter
    if (search) {
      query = query.or(`title.ilike.%${search}%,tc_package_id.eq.${parseInt(search) || 0}`)
    }

    // Apply date filters
    if (dateFrom) {
      query = query.gte('date_range_end', dateFrom)
    }
    if (dateTo) {
      query = query.lte('date_range_start', dateTo)
    }

    const { data: packages, error: packagesError } = await query

    if (packagesError) {
      console.error('[Comercial API] Error fetching packages:', packagesError)
      throw packagesError
    }

    // Get all unique tc_transport_ids from packages
    const transportIds = new Set<string>()
    for (const pkg of packages || []) {
      for (const transport of pkg.package_transports || []) {
        if (transport.tc_transport_id) {
          transportIds.add(transport.tc_transport_id)
        }
      }
    }

    // Fetch flights with their modality inventories
    let cuposMap = new Map<string, { total: number; sold: number; remaining: number }>()

    if (transportIds.size > 0) {
      const { data: flights, error: flightsError } = await db
        .from('flights')
        .select(`
          tc_transport_id,
          modalities (
            modality_inventories (
              quantity,
              sold,
              remaining_seats
            )
          )
        `)
        .in('tc_transport_id', Array.from(transportIds))

      if (!flightsError && flights) {
        for (const flight of flights) {
          if (!flight.tc_transport_id) continue

          let total = 0
          let sold = 0
          let remaining = 0

          for (const modality of flight.modalities || []) {
            for (const inventory of modality.modality_inventories || []) {
              total += inventory.quantity || 0
              sold += inventory.sold || 0
              remaining += inventory.remaining_seats || inventory.quantity || 0
            }
          }

          cuposMap.set(flight.tc_transport_id, { total, sold, remaining })
        }
      }
    }

    // Enrich packages with cupos data
    const enrichedPackages: PackageForComercial[] = (packages || []).map((pkg) => {
      // Calculate cupos from all transports
      let cupos_total = 0
      let cupos_sold = 0
      let cupos_remaining = 0

      for (const transport of pkg.package_transports || []) {
        if (transport.tc_transport_id) {
          const cupos = cuposMap.get(transport.tc_transport_id)
          if (cupos) {
            cupos_total = Math.max(cupos_total, cupos.total)
            cupos_sold = Math.max(cupos_sold, cupos.sold)
            cupos_remaining = Math.max(cupos_remaining, cupos.remaining)
          }
        }
      }

      return {
        ...pkg,
        infants_count: pkg.infants_count || 0,
        cupos_total,
        cupos_sold,
        cupos_remaining,
      } as PackageForComercial
    })

    // Filter by destination if specified (client-side due to nested data)
    let filteredPackages = enrichedPackages
    if (destination && destination !== 'all') {
      filteredPackages = enrichedPackages.filter((pkg) =>
        pkg.package_destinations?.some(
          (d) => d.destination_code === destination || d.destination_name === destination
        )
      )
    }

    // Calculate stats
    const stats = {
      total: filteredPackages.length,
      conCupos: filteredPackages.filter((p) => p.cupos_remaining > 0).length,
      pocosCupos: filteredPackages.filter((p) => p.cupos_remaining > 0 && p.cupos_remaining <= 5).length,
      sinCupos: filteredPackages.filter((p) => p.cupos_remaining === 0).length,
    }

    // Get unique destinations for filter dropdown
    const destinationsSet = new Set<string>()
    for (const pkg of enrichedPackages) {
      for (const dest of pkg.package_destinations || []) {
        if (dest.destination_name) {
          destinationsSet.add(dest.destination_name)
        }
      }
    }
    const destinations = Array.from(destinationsSet).sort()

    return NextResponse.json({
      packages: filteredPackages,
      stats,
      destinations,
    })
  } catch (error) {
    console.error('[Comercial API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching data' },
      { status: 500 }
    )
  }
}
