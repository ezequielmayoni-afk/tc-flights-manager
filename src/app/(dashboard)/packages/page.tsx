import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Package, Eye, AlertCircle } from 'lucide-react'
import { PackagesTable } from '@/components/packages/PackagesTable'
import { PackageImportButton } from '@/components/packages/PackageImportButton'

type PackageWithDestinations = {
  id: number
  tc_package_id: number
  title: string
  large_title: string | null
  image_url: string | null
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  original_price_per_pax: number | null
  current_price_per_pax: number | null
  total_price: number | null
  currency: string
  price_variance_pct: number | null
  adults_count: number
  children_count: number
  nights_count: number
  destinations_count: number
  transports_count: number
  hotels_count: number
  transfers_count: number
  cars_count: number
  tickets_count: number
  tours_count: number
  tc_active: boolean
  status: string
  send_to_design: boolean
  send_to_marketing: boolean
  themes: string[]
  tc_idea_url: string | null
  tc_creation_date: string | null
  created_at: string
  last_sync_at: string | null
  last_price_change_at: string | null
  // Cost breakdown columns
  air_cost: number | null
  land_cost: number | null
  agency_fee: number | null
  flight_departure_date: string | null
  airline_code: string | null
  airline_name: string | null
  flight_numbers: string | null
  // Monitoring fields
  monitor_enabled: boolean
  target_price: number | null
  requote_status: 'pending' | 'checking' | 'needs_manual' | 'completed' | null
  last_requote_at: string | null
  requote_price: number | null
  requote_variance_pct: number | null
  package_destinations: {
    destination_code: string
    destination_name: string
  }[]
  package_hotels: {
    hotel_name: string | null
    board_type: string | null
  }[]
  package_transports: {
    baggage_info: string | null
    checked_baggage: string | null
    cabin_baggage: string | null
  }[]
}

async function getPackages(): Promise<PackageWithDestinations[]> {
  const supabase = await createClient()

  const { data: packages, error } = await supabase
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      large_title,
      image_url,
      departure_date,
      date_range_start,
      date_range_end,
      original_price_per_pax,
      current_price_per_pax,
      total_price,
      currency,
      price_variance_pct,
      adults_count,
      children_count,
      nights_count,
      destinations_count,
      transports_count,
      hotels_count,
      transfers_count,
      cars_count,
      tickets_count,
      tours_count,
      tc_active,
      status,
      send_to_design,
      send_to_marketing,
      themes,
      tc_idea_url,
      tc_creation_date,
      created_at,
      last_sync_at,
      last_price_change_at,
      air_cost,
      land_cost,
      agency_fee,
      flight_departure_date,
      airline_code,
      airline_name,
      flight_numbers,
      monitor_enabled,
      target_price,
      requote_status,
      last_requote_at,
      requote_price,
      requote_variance_pct,
      package_destinations(destination_code, destination_name),
      package_hotels(hotel_name, board_type),
      package_transports(baggage_info, checked_baggage, cabin_baggage)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Error fetching packages:', error)
    return []
  }

  return (packages as PackageWithDestinations[]) || []
}

async function getStats() {
  const supabase = await createClient()

  const [
    { count: totalCount },
    { count: activeCount },
    { count: monitoringCount },
    { count: needsManualRequoteCount },
  ] = await Promise.all([
    supabase.from('packages').select('*', { count: 'exact', head: true }),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('tc_active', true),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('monitor_enabled', true),
    supabase.from('packages').select('*', { count: 'exact', head: true }).eq('requote_status', 'needs_manual'),
  ])

  return {
    total: totalCount || 0,
    active: activeCount || 0,
    monitoring: monitoringCount || 0,
    needsManualRequote: needsManualRequoteCount || 0,
  }
}

export default async function PackagesPage() {
  const [packages, stats] = await Promise.all([getPackages(), getStats()])

  return (
    <div className="flex flex-col h-full">
      <Header title="Paquetes" />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2">
              <Package className="h-5 w-5 text-muted-foreground" />
              <span className="text-muted-foreground">
                {stats.total} paquetes en total
              </span>
            </div>

            <div className="flex items-center gap-2 text-green-600">
              <span className="w-2 h-2 rounded-full bg-green-500" />
              <span>{stats.active} activos</span>
            </div>

            {stats.monitoring > 0 && (
              <div className="flex items-center gap-2 text-blue-600">
                <Eye className="h-4 w-4" />
                <span>{stats.monitoring} en monitoreo</span>
              </div>
            )}

            {stats.needsManualRequote > 0 && (
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-4 w-4" />
                <span>{stats.needsManualRequote} recotización manual</span>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <PackageImportButton />
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <PackagesTable packages={packages} />
        </div>
      </div>
    </div>
  )
}
