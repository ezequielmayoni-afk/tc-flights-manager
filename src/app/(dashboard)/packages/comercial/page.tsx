import { createClient } from '@supabase/supabase-js'
import { ComercialDashboard } from '@/components/comercial/ComercialDashboard'
import type { PackageForComercial } from '@/types/comercial'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const dynamic = 'force-dynamic'

export default async function ComercialPage() {
  const db = getSupabaseClient()

  // Fetch ALL active packages (we'll filter by cupos or marketing status after enriching with cupos data)
  const { data: rawPackages, error } = await db
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      image_url,
      tc_idea_url,
      departure_date,
      date_range_start,
      date_range_end,
      air_cost,
      land_cost,
      agency_fee,
      current_price_per_pax,
      total_price,
      currency,
      adults_count,
      children_count,
      infants_count,
      nights_count,
      transports_count,
      hotels_count,
      tc_active,
      status,
      send_to_marketing,
      monitor_enabled,
      requote_price,
      requote_status,
      requote_variance_pct,
      last_requote_at,
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
        origin_code,
        origin_name,
        destination_code,
        destination_name,
        baggage_info,
        checked_baggage,
        cabin_baggage,
        tc_provider_code,
        supplier_name
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
    .order('date_range_start', { ascending: true })

  if (error) {
    console.error('[Comercial Page] Error fetching packages:', error)
  }

  // Fetch all flights with segments and cupo data for matching
  const { data: allFlights } = await db
    .from('flights')
    .select(`
      id,
      supplier_id,
      airline_code,
      start_date,
      end_date,
      flight_segments (
        departure_location_code,
        arrival_location_code,
        num_service
      ),
      modalities (
        modality_inventories (
          quantity,
          sold,
          remaining_seats
        )
      )
    `)
    .eq('active', true)

  // Build a map to match flights by route + airline + date
  // Key format: "AIRLINE-ORIGIN-DEST" -> array of flights with date ranges
  type FlightMatch = {
    flight_id: number
    supplier_id: number
    start_date: string
    end_date: string
    flight_numbers: string[]
    cupos: { total: number; sold: number; remaining: number }
  }
  const flightMatchMap = new Map<string, FlightMatch[]>()

  if (allFlights) {
    for (const flight of allFlights) {
      // Calculate cupos from modalities
      let total = 0
      let sold = 0
      let remaining = 0
      for (const modality of flight.modalities || []) {
        for (const inventory of modality.modality_inventories || []) {
          total += inventory.quantity || 0
          sold += inventory.sold || 0
          remaining += inventory.remaining_seats ?? inventory.quantity ?? 0
        }
      }

      // Get flight routes from segments
      const segments = flight.flight_segments || []
      if (segments.length === 0) continue

      // Use first segment's origin and last segment's destination
      const origin = segments[0]?.departure_location_code
      const destination = segments[segments.length - 1]?.arrival_location_code
      const flightNumbers = segments.map((s: { num_service: string | null }) => s.num_service).filter((x): x is string => x !== null)

      if (!origin || !destination) continue

      const key = `${flight.airline_code}-${origin}-${destination}`

      const matchData: FlightMatch = {
        flight_id: flight.id,
        supplier_id: flight.supplier_id,
        start_date: flight.start_date,
        end_date: flight.end_date,
        flight_numbers: flightNumbers,
        cupos: { total, sold, remaining },
      }

      if (!flightMatchMap.has(key)) {
        flightMatchMap.set(key, [])
      }
      flightMatchMap.get(key)!.push(matchData)
    }
  }

  // Function to match a package transport with local flights
  function findMatchingFlight(transport: {
    marketing_airline_code?: string | null
    origin_code?: string | null
    destination_code?: string | null
    departure_date?: string | null
    transport_number?: string | null
  }): FlightMatch | null {
    const airline = transport.marketing_airline_code
    const origin = transport.origin_code
    const dest = transport.destination_code
    const depDate = transport.departure_date
    const flightNum = transport.transport_number

    if (!airline || !origin || !dest) return null

    const key = `${airline}-${origin}-${dest}`
    const candidates = flightMatchMap.get(key)
    if (!candidates || candidates.length === 0) return null

    // Find flight where departure_date is within start_date and end_date
    // Match by route + date is sufficient, flight number is optional
    for (const candidate of candidates) {
      if (depDate) {
        const dep = new Date(depDate)
        const start = new Date(candidate.start_date)
        const end = new Date(candidate.end_date)
        if (dep >= start && dep <= end) {
          // Match found by route + date - return it
          return candidate
        }
      }
    }

    // No date match found
    return null
  }

  // Get all suppliers from the suppliers table (needed for enrichment)
  const { data: suppliersData } = await db
    .from('suppliers')
    .select('id, name')
    .order('name')

  // Create a map of supplier_id to supplier_name
  const supplierIdToName = new Map<number, string>()
  for (const s of suppliersData || []) {
    supplierIdToName.set(s.id, s.name)
  }

  // Enrich packages with cupos data and matched supplier
  const allPackagesEnriched: PackageForComercial[] = (rawPackages || []).map((pkg) => {
    let cupos_total = 0
    let cupos_sold = 0
    let cupos_remaining = 0
    let matched_supplier_id: number | null = null
    let matched_supplier_name: string | null = null

    for (const transport of pkg.package_transports || []) {
      // Try to match with local flights by route + airline + date
      const matchedFlight = findMatchingFlight({
        marketing_airline_code: transport.marketing_airline_code,
        origin_code: transport.origin_code,
        destination_code: transport.destination_code,
        departure_date: transport.departure_date,
        transport_number: transport.transport_number,
      })

      if (matchedFlight) {
        cupos_total = Math.max(cupos_total, matchedFlight.cupos.total)
        cupos_sold = Math.max(cupos_sold, matchedFlight.cupos.sold)
        cupos_remaining = Math.max(cupos_remaining, matchedFlight.cupos.remaining)
        // Use the supplier from the matched local flight
        if (!matched_supplier_id) {
          matched_supplier_id = matchedFlight.supplier_id
          matched_supplier_name = supplierIdToName.get(matchedFlight.supplier_id) || null
        }
      }
    }

    return {
      ...pkg,
      infants_count: pkg.infants_count || 0,
      cupos_total,
      cupos_sold,
      cupos_remaining,
      matched_supplier_id,
      matched_supplier_name,
    } as PackageForComercial
  })

  // Filter: Show packages that are in marketing OR have matched flight (cupos)
  // If a package matches a local flight, ALWAYS show it regardless of marketing status
  const packages = allPackagesEnriched.filter((pkg) => {
    const isInMarketing = pkg.status === 'in_marketing' || pkg.status === 'published' || pkg.send_to_marketing
    const hasMatchedFlight = pkg.matched_supplier_id !== null
    return isInMarketing || hasMatchedFlight
  })

  // Calculate stats
  // "Con Cupos" = paquetes que matchean con algún vuelo local (tienen matched_supplier_id)
  const packagesWithMatchedFlight = packages.filter((p) => p.matched_supplier_id !== null)
  const packagesWithCupoData = packages.filter((p) => p.cupos_total > 0)
  const stats = {
    total: packages.length,
    conCupos: packagesWithMatchedFlight.length,
    pocosCupos: packagesWithCupoData.filter((p) => p.cupos_remaining > 0 && p.cupos_remaining <= 5).length,
    sinCupos: packagesWithCupoData.filter((p) => p.cupos_remaining === 0).length,
  }

  // Get unique destinations
  const destinationsSet = new Set<string>()
  for (const pkg of packages) {
    for (const dest of pkg.package_destinations || []) {
      if (dest.destination_name) {
        destinationsSet.add(dest.destination_name)
      }
    }
  }
  const destinations = Array.from(destinationsSet).sort()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Comercial</h1>
          <p className="text-muted-foreground">Cotizador rapido de paquetes</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold text-blue-600">{stats.total}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Con Cupos</p>
          <p className="text-2xl font-bold text-green-600">{stats.conCupos}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Pocos Cupos</p>
          <p className="text-2xl font-bold text-amber-600">{stats.pocosCupos}</p>
        </div>
        <div className="bg-white p-4 rounded-lg border">
          <p className="text-sm text-muted-foreground">Sin Cupos</p>
          <p className="text-2xl font-bold text-red-600">{stats.sinCupos}</p>
        </div>
      </div>

      {/* Dashboard */}
      <ComercialDashboard
        packages={packages}
        destinations={destinations}
        suppliers={suppliersData || []}
      />
    </div>
  )
}
