import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ModalityInventory {
  quantity: number
  sold: number
  start_date: string
  end_date: string
}

interface Modality {
  id: number
  code?: string
  modality_inventories: ModalityInventory[]
}

interface Supplier {
  id: number
  name: string
}

interface FlightWithModalities {
  id: number
  name: string
  base_id: string
  start_date: string
  end_date: string
  leg_type: string | null
  paired_flight_id: number | null
  active: boolean
  release_contract: number
  supplier_id: number | null
  suppliers: Supplier | null
  modalities: Modality[]
}

interface SupplierStats {
  supplier_id: number
  supplier_name: string
  flights_count: number
  total_quotas: number
  sold_quotas: number
  remaining_quotas: number
  occupancy_rate: number
}

interface ReservationRow {
  flight_id: number | null
  adults: number | null
  children: number | null
  infants: number | null
  status: string
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Optional filters
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const supplierId = searchParams.get('supplierId')

    console.log('[Dashboard API] Filters received:', { startDate, endDate, supplierId })

    // If date filters are provided, we filter by reservation date (when the sale was made)
    // Otherwise, we show all active flights with their current inventory status

    let soldByFlight: Map<number, number> = new Map()
    let filteredFlightIds: number[] | null = null

    // If date range is specified, get reservations in that range
    if (startDate || endDate) {
      let reservationsQuery = supabase
        .from('reservations')
        .select('flight_id, adults, children, infants, status')
        .neq('status', 'cancelled')

      // Filter by reservation_date (Argentina timezone UTC-3)
      if (startDate) {
        reservationsQuery = reservationsQuery.gte('reservation_date', `${startDate}T03:00:00Z`)
      }
      if (endDate) {
        const nextDay = new Date(endDate)
        nextDay.setDate(nextDay.getDate() + 1)
        const nextDayStr = nextDay.toISOString().split('T')[0]
        reservationsQuery = reservationsQuery.lte('reservation_date', `${nextDayStr}T02:59:59.999Z`)
      }

      const { data: reservations, error: resError } = await reservationsQuery

      if (resError) {
        console.error('[Dashboard API] Error fetching reservations:', resError)
        return NextResponse.json({ error: resError.message }, { status: 500 })
      }

      console.log('[Dashboard API] Reservations in date range:', reservations?.length || 0)

      // Calculate sold by flight from reservations in the date range
      const typedReservations = reservations as ReservationRow[] | null
      typedReservations?.forEach(r => {
        if (r.flight_id) {
          const passengers = (r.adults || 0) + (r.children || 0) + (r.infants || 0)
          soldByFlight.set(r.flight_id, (soldByFlight.get(r.flight_id) || 0) + passengers)
        }
      })

      // Get unique flight IDs that have sales in this period
      filteredFlightIds = Array.from(soldByFlight.keys())
      console.log('[Dashboard API] Flights with sales in period:', filteredFlightIds.length)
    }

    // Build base query for flights with inventories and suppliers
    // Only count outbound flights (or flights without paired_flight_id) to count ida+vuelta as 1
    let flightsQuery = supabase
      .from('flights')
      .select(`
        id,
        name,
        base_id,
        start_date,
        end_date,
        leg_type,
        paired_flight_id,
        active,
        release_contract,
        supplier_id,
        suppliers(id, name),
        modalities(
          id,
          modality_inventories(
            quantity,
            sold,
            start_date,
            end_date
          )
        )
      `)
      .or('leg_type.eq.outbound,paired_flight_id.is.null')
      .eq('active', true)

    // Note: We always show ALL active flights for total quotas
    // When date filter is active, we only filter the SALES count, not the flights

    // Apply supplier filter if provided
    if (supplierId) {
      flightsQuery = flightsQuery.eq('supplier_id', parseInt(supplierId))
    }

    const { data: flights, error } = await flightsQuery

    console.log('[Dashboard API] Flights found:', flights?.length || 0)

    if (error) {
      console.error('[Dashboard API] Error fetching flights:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Calculate totals and stats by supplier
    let totalQuotas = 0
    let soldQuotas = 0
    const flightsCount = flights?.length || 0

    const typedFlights = flights as unknown as FlightWithModalities[]

    // Map to accumulate stats by supplier
    const supplierStatsMap = new Map<number, {
      supplier_id: number
      supplier_name: string
      flights_count: number
      total_quotas: number
      sold_quotas: number
    }>()

    typedFlights?.forEach(flight => {
      let flightQuotas = 0
      let flightSold = 0

      flight.modalities?.forEach(modality => {
        modality.modality_inventories?.forEach(inv => {
          totalQuotas += inv.quantity || 0
          flightQuotas += inv.quantity || 0
        })
      })

      // If date range filter is active, use sales from that period only
      // Otherwise, use the total sold from inventory
      if (filteredFlightIds !== null) {
        flightSold = soldByFlight.get(flight.id) || 0
        soldQuotas += flightSold
      } else {
        flight.modalities?.forEach(modality => {
          modality.modality_inventories?.forEach(inv => {
            soldQuotas += inv.sold || 0
            flightSold += inv.sold || 0
          })
        })
      }

      // Accumulate by supplier
      const suppId = flight.supplier_id || 0
      const suppName = flight.suppliers?.name || 'Sin proveedor'

      if (!supplierStatsMap.has(suppId)) {
        supplierStatsMap.set(suppId, {
          supplier_id: suppId,
          supplier_name: suppName,
          flights_count: 0,
          total_quotas: 0,
          sold_quotas: 0,
        })
      }

      const supplierData = supplierStatsMap.get(suppId)!
      supplierData.flights_count++
      supplierData.total_quotas += flightQuotas
      supplierData.sold_quotas += flightSold
    })

    // Convert map to array and calculate rates
    const statsBySupplier: SupplierStats[] = Array.from(supplierStatsMap.values())
      .map(s => ({
        ...s,
        remaining_quotas: s.total_quotas - s.sold_quotas,
        occupancy_rate: s.total_quotas > 0 ? Math.round((s.sold_quotas / s.total_quotas) * 100) : 0,
      }))
      .sort((a, b) => b.total_quotas - a.total_quotas) // Sort by total quotas descending

    // Get expiring quotas - flights whose release date (start_date - release_contract) is within next 10 days
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tenDaysFromNow = new Date(today)
    tenDaysFromNow.setDate(tenDaysFromNow.getDate() + 10)

    // Get all active flights and filter by release date in code
    let expiringQuery = supabase
      .from('flights')
      .select(`
        id,
        name,
        base_id,
        tc_transport_id,
        start_date,
        end_date,
        leg_type,
        paired_flight_id,
        active,
        release_contract,
        supplier_id,
        suppliers(id, name),
        modalities(
          id,
          code,
          modality_inventories(
            quantity,
            sold,
            start_date,
            end_date
          )
        )
      `)
      .eq('active', true)
      .or('leg_type.eq.outbound,paired_flight_id.is.null')
      .gte('start_date', today.toISOString().split('T')[0]) // Flight hasn't departed yet

    // Apply supplier filter to expiring flights too
    if (supplierId) {
      expiringQuery = expiringQuery.eq('supplier_id', parseInt(supplierId))
    }

    const { data: expiringFlights, error: expiringError } = await expiringQuery

    if (expiringError) {
      console.error('[Dashboard API] Error fetching expiring flights:', expiringError)
    }

    const typedExpiringFlights = expiringFlights as unknown as (FlightWithModalities & { tc_transport_id: string })[]

    // Process expiring flights - filter by release date within next 10 days
    const expiringQuotas = (typedExpiringFlights || [])
      .map(flight => {
        // Calculate release date: start_date - release_contract days
        const startDate = new Date(flight.start_date)
        const releaseContract = flight.release_contract || 0
        const releaseDate = new Date(startDate)
        releaseDate.setDate(releaseDate.getDate() - releaseContract)

        let quantity = 0
        let sold = 0

        flight.modalities?.forEach(modality => {
          modality.modality_inventories?.forEach(inv => {
            quantity += inv.quantity || 0
            sold += inv.sold || 0
          })
        })

        const remaining = quantity - sold
        const daysUntilRelease = Math.ceil(
          (releaseDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        )

        return {
          id: flight.id,
          name: flight.name,
          base_id: flight.base_id,
          tc_transport_id: flight.tc_transport_id,
          start_date: flight.start_date,
          release_date: releaseDate.toISOString().split('T')[0],
          release_contract: releaseContract,
          quantity,
          sold,
          remaining,
          daysUntilRelease,
          supplier_id: flight.supplier_id,
          supplier_name: flight.suppliers?.name || 'Sin proveedor',
        }
      })
      // Filter: release date is between today and 10 days from now, and has remaining quotas
      .filter(f => f.remaining > 0 && f.daysUntilRelease >= 0 && f.daysUntilRelease <= 10)
      .sort((a, b) => a.daysUntilRelease - b.daysUntilRelease) // Sort by days until release

    return NextResponse.json({
      stats: {
        flightsCount,
        totalQuotas,
        soldQuotas,
        remainingQuotas: totalQuotas - soldQuotas,
        occupancyRate: totalQuotas > 0 ? Math.round((soldQuotas / totalQuotas) * 100) : 0,
      },
      statsBySupplier,
      expiringQuotas,
    })
  } catch (error) {
    console.error('[Dashboard API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
