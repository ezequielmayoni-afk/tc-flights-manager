import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/button'
import { Plus, RefreshCw } from 'lucide-react'
import Link from 'next/link'
import { FlightsTable } from '@/components/flights/FlightsTable'

type FlightWithSegments = {
  id: number
  base_id: string
  name: string
  airline_code: string
  start_date: string
  end_date: string
  sync_status: string
  base_adult_rt_price: number
  base_children_rt_price: number
  base_infant_rt_price: number
  release_contract: number
  created_at: string
  last_sync_at: string | null
  leg_type?: 'outbound' | 'return' | null
  paired_flight_id?: number | null
  tc_transport_id?: string | null
  supplier_id: number
  suppliers: { name: string } | null
  flight_segments: {
    departure_location_code: string
    arrival_location_code: string
    sort_order: number
    plus_days: number
  }[]
  modalities?: {
    baggage_allowance?: string | null
    includes_backpack?: boolean
    carryon_weight?: number
    checked_bag_weight?: number
    checked_bags_quantity?: number
    modality_inventories?: {
      quantity: number
      sold: number
      remaining_seats: number
    }[]
  }[]
}

async function getFlights(): Promise<FlightWithSegments[]> {
  const supabase = await createClient()

  const { data: flights, error } = await supabase
    .from('flights')
    .select(`
      id,
      base_id,
      name,
      airline_code,
      start_date,
      end_date,
      sync_status,
      base_adult_rt_price,
      base_children_rt_price,
      base_infant_rt_price,
      release_contract,
      created_at,
      last_sync_at,
      leg_type,
      paired_flight_id,
      tc_transport_id,
      supplier_id,
      suppliers(name),
      flight_segments(departure_location_code, arrival_location_code, sort_order, plus_days),
      modalities(baggage_allowance, includes_backpack, carryon_weight, checked_bag_weight, checked_bags_quantity, modality_inventories(quantity, sold, remaining_seats))
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    console.error('Error fetching flights:', error)
    return []
  }

  return (flights as FlightWithSegments[]) || []
}

export default async function FlightsPage() {
  const flights = await getFlights()

  return (
    <div className="flex flex-col h-full">
      <Header title="Vuelos" />

      <div className="flex-1 p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <p className="text-muted-foreground">
              {flights.length} vuelos en total
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" asChild>
              <Link href="/flights/import">
                <RefreshCw className="h-4 w-4 mr-2" />
                Importar
              </Link>
            </Button>
            <Button asChild>
              <Link href="/flights/new">
                <Plus className="h-4 w-4 mr-2" />
                Nuevo vuelo
              </Link>
            </Button>
          </div>
        </div>

        <div className="bg-white rounded-lg border">
          <FlightsTable flights={flights} />
        </div>
      </div>
    </div>
  )
}
