import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { AlertTriangle } from 'lucide-react'
import { RequoteTable } from '@/components/packages/RequoteTable'

type PackageNeedingRequote = {
  id: number
  tc_package_id: number
  title: string
  date_range_start: string | null
  date_range_end: string | null
  current_price_per_pax: number | null
  currency: string
  target_price: number | null
  requote_price: number | null
  requote_variance_pct: number | null
  last_requote_at: string | null
  air_cost: number | null
  land_cost: number | null
  adults_count: number
  children_count: number
  // Status
  status: string
  send_to_design: boolean
  send_to_marketing: boolean
  // Services counts
  transports_count: number
  hotels_count: number
  transfers_count: number
  cars_count: number
  tickets_count: number
  tours_count: number
  // Flight info
  airline_code: string | null
  airline_name: string | null
  flight_numbers: string | null
  flight_departure_date: string | null
  // Hotels
  package_hotels: {
    hotel_name: string | null
    board_type: string | null
  }[]
}

async function getPackagesNeedingRequote(): Promise<PackageNeedingRequote[]> {
  const supabase = await createClient()

  const { data: packages, error } = await supabase
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      date_range_start,
      date_range_end,
      current_price_per_pax,
      currency,
      target_price,
      requote_price,
      requote_variance_pct,
      last_requote_at,
      air_cost,
      land_cost,
      adults_count,
      children_count,
      status,
      send_to_design,
      send_to_marketing,
      transports_count,
      hotels_count,
      transfers_count,
      cars_count,
      tickets_count,
      tours_count,
      airline_code,
      airline_name,
      flight_numbers,
      flight_departure_date,
      package_hotels(hotel_name, board_type)
    `)
    .eq('requote_status', 'needs_manual')
    .eq('monitor_enabled', true)
    .order('requote_variance_pct', { ascending: false })

  if (error) {
    console.error('Error fetching packages needing requote:', error)
    return []
  }

  return (packages as PackageNeedingRequote[]) || []
}

export default async function RequotePage() {
  const packages = await getPackagesNeedingRequote()

  return (
    <div className="flex flex-col h-full">
      <Header title="Recotización Manual" />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <span className="text-muted-foreground">
              {packages.length} paquetes pendientes de recotización manual
            </span>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <RequoteTable packages={packages} />
        </div>
      </div>
    </div>
  )
}
