// Types for the Comercial (Sales) Dashboard

export interface PackageDestination {
  destination_code: string
  destination_name: string
}

export interface PackageTransport {
  tc_transport_id: string | null
  transport_number: string | null
  marketing_airline_code: string | null
  company: string | null
  departure_date: string | null
  arrival_date: string | null
  departure_time: string | null
  arrival_time: string | null
  origin_code: string | null
  origin_name: string | null
  destination_code: string | null
  destination_name: string | null
  // Baggage info
  baggage_info: string | null
  checked_baggage: string | null
  cabin_baggage: string | null
  // Provider info for identifying cupos
  tc_provider_code: string | null
  supplier_name: string | null
}

export interface PackageHotel {
  hotel_name: string | null
  room_type: string | null
  room_name: string | null
  board_type: string | null
  board_name: string | null
  nights: number | null
  check_in_date: string | null
  check_out_date: string | null
}

export interface PackageForComercial {
  id: number
  tc_package_id: number
  title: string
  image_url: string | null
  tc_idea_url: string | null
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  air_cost: number | null
  land_cost: number | null
  agency_fee: number | null
  current_price_per_pax: number | null
  total_price: number | null
  currency: string
  // Requote/Monitor fields
  monitor_enabled: boolean
  requote_price: number | null
  requote_status: string | null
  requote_variance_pct: number | null
  last_requote_at: string | null
  adults_count: number
  children_count: number
  infants_count: number
  nights_count: number
  transports_count: number
  hotels_count: number
  tc_active: boolean
  status: string
  send_to_marketing?: boolean
  // Computed cupos data (from matched local flights)
  cupos_total: number
  cupos_sold: number
  cupos_remaining: number
  // Supplier from matched local flight (for filtering and display)
  matched_supplier_id: number | null
  matched_supplier_name: string | null
  // Related data
  package_destinations: PackageDestination[]
  package_transports: PackageTransport[]
  package_hotels: PackageHotel[]
}

export interface ComercialStats {
  total: number
  conCupos: number
  pocosCupos: number
  sinCupos: number
}
