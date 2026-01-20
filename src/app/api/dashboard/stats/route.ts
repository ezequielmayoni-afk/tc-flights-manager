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

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams

    // Optional filters
    const startDate = searchParams.get('startDate')
    const endDate = searchParams.get('endDate')
    const supplierId = searchParams.get('supplierId')

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

    // Apply date filters if provided
    if (startDate) {
      flightsQuery = flightsQuery.gte('start_date', startDate)
    }
    if (endDate) {
      flightsQuery = flightsQuery.lte('end_date', endDate)
    }
    // Apply supplier filter if provided
    if (supplierId) {
      flightsQuery = flightsQuery.eq('supplier_id', parseInt(supplierId))
    }

    const { data: flights, error } = await flightsQuery

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
          soldQuotas += inv.sold || 0
          flightQuotas += inv.quantity || 0
          flightSold += inv.sold || 0
        })
      })

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

    // Get expiring quotas (flights ending within 7 days)
    const today = new Date()
    const sevenDaysFromNow = new Date(today)
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7)

    let expiringQuery = supabase
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
      .gte('end_date', today.toISOString().split('T')[0])
      .lte('end_date', sevenDaysFromNow.toISOString().split('T')[0])
      .order('end_date', { ascending: true })

    // Apply supplier filter to expiring flights too
    if (supplierId) {
      expiringQuery = expiringQuery.eq('supplier_id', parseInt(supplierId))
    }

    const { data: expiringFlights, error: expiringError } = await expiringQuery

    if (expiringError) {
      console.error('[Dashboard API] Error fetching expiring flights:', expiringError)
    }

    const typedExpiringFlights = expiringFlights as unknown as FlightWithModalities[]

    // Process expiring flights with remaining quotas
    const expiringQuotas = (typedExpiringFlights || []).map(flight => {
      let quantity = 0
      let sold = 0

      flight.modalities?.forEach(modality => {
        modality.modality_inventories?.forEach(inv => {
          quantity += inv.quantity || 0
          sold += inv.sold || 0
        })
      })

      const remaining = quantity - sold
      const daysUntilExpiry = Math.ceil(
        (new Date(flight.end_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      )

      return {
        id: flight.id,
        name: flight.name,
        base_id: flight.base_id,
        end_date: flight.end_date,
        quantity,
        sold,
        remaining,
        daysUntilExpiry,
        supplier_id: flight.supplier_id,
        supplier_name: flight.suppliers?.name || 'Sin proveedor',
      }
    }).filter(f => f.remaining > 0) // Only show flights with remaining quotas

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
