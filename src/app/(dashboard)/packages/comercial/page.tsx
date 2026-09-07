import { createClient } from '@supabase/supabase-js'
import {
  loadFlightsForMatch,
  buildFlightMatchIndex,
  matchPackageFlights,
  aggregatePackageCupos,
} from '@/lib/packages/flight-match'
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

  // Cupos cargados en Vuelos, para cruzarlos con los tramos de cada paquete.
  // La lógica de matcheo vive en @/lib/packages/flight-match.
  const allFlights = await loadFlightsForMatch(db)
  const flightIndex = buildFlightMatchIndex(allFlights)

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

    const matches = matchPackageFlights(flightIndex, pkg.package_transports || [])
    const cupos = aggregatePackageCupos(matches)
    cupos_total = cupos.total
    cupos_sold = cupos.sold
    cupos_remaining = cupos.remaining

    const firstSupplierId = matches.find(m => m.supplierId !== null)?.supplierId ?? null
    if (firstSupplierId !== null) {
      matched_supplier_id = firstSupplierId
      matched_supplier_name = supplierIdToName.get(firstSupplierId) || null
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

  // Filter: solo packages que están en marketing (status canónico).
  // Los cupos siguen enriqueciéndose para los que matchean, pero no se incluyen
  // packages "sólo con cupos" que no están en marketing — esto se decidió 2026-05-19.
  const packages = allPackagesEnriched.filter((pkg) => pkg.status === 'in_marketing')

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
