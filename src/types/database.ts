export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string | null
          role: 'admin' | 'user'
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          full_name?: string | null
          role?: 'admin' | 'user'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          full_name?: string | null
          role?: 'admin' | 'user'
          created_at?: string
          updated_at?: string
        }
      }
      suppliers: {
        Row: {
          id: number
          name: string
          created_at: string
        }
        Insert: {
          id: number
          name: string
          created_at?: string
        }
        Update: {
          id?: number
          name?: string
          created_at?: string
        }
      }
      flights: {
        Row: {
          id: number
          supplier_id: number
          base_id: string
          tc_transport_id: string | null
          name: string
          airline_code: string
          transport_type: string
          active: boolean
          price_per_pax: boolean
          currency: string
          base_adult_price: number
          base_children_price: number
          base_infant_price: number
          base_adult_rt_price: number
          base_children_rt_price: number
          base_infant_rt_price: number
          adult_taxes_amount: number
          children_taxes_amount: number
          infant_taxes_amount: number
          adult_rt_taxes_amount: number
          children_rt_taxes_amount: number
          infant_rt_taxes_amount: number
          start_date: string
          end_date: string
          release_contract: number
          operational_days: string[]
          option_codes: string[]
          only_holiday_package: boolean
          show_in_transport_quotas_landing: boolean
          min_child_age: number
          max_child_age: number
          min_infant_age: number
          max_infant_age: number
          allow_ow_price: boolean
          allow_rt_price: boolean
          product_types: string[]
          combinable_rt_contracts: string[]
          sync_status: 'pending' | 'synced' | 'error' | 'modified'
          last_sync_at: string | null
          sync_error: string | null
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          supplier_id?: number
          base_id: string
          tc_transport_id?: string | null
          name: string
          airline_code: string
          transport_type?: string
          active?: boolean
          price_per_pax?: boolean
          currency?: string
          base_adult_price?: number
          base_children_price?: number
          base_infant_price?: number
          base_adult_rt_price?: number
          base_children_rt_price?: number
          base_infant_rt_price?: number
          adult_taxes_amount?: number
          children_taxes_amount?: number
          infant_taxes_amount?: number
          adult_rt_taxes_amount?: number
          children_rt_taxes_amount?: number
          infant_rt_taxes_amount?: number
          start_date: string
          end_date: string
          release_contract?: number
          operational_days?: string[]
          option_codes?: string[]
          only_holiday_package?: boolean
          show_in_transport_quotas_landing?: boolean
          min_child_age?: number
          max_child_age?: number
          min_infant_age?: number
          max_infant_age?: number
          allow_ow_price?: boolean
          allow_rt_price?: boolean
          product_types?: string[]
          combinable_rt_contracts?: string[]
          sync_status?: 'pending' | 'synced' | 'error' | 'modified'
          last_sync_at?: string | null
          sync_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          supplier_id?: number
          base_id?: string
          tc_transport_id?: string | null
          name?: string
          airline_code?: string
          transport_type?: string
          active?: boolean
          price_per_pax?: boolean
          currency?: string
          base_adult_price?: number
          base_children_price?: number
          base_infant_price?: number
          base_adult_rt_price?: number
          base_children_rt_price?: number
          base_infant_rt_price?: number
          adult_taxes_amount?: number
          children_taxes_amount?: number
          infant_taxes_amount?: number
          adult_rt_taxes_amount?: number
          children_rt_taxes_amount?: number
          infant_rt_taxes_amount?: number
          start_date?: string
          end_date?: string
          release_contract?: number
          operational_days?: string[]
          option_codes?: string[]
          only_holiday_package?: boolean
          show_in_transport_quotas_landing?: boolean
          min_child_age?: number
          max_child_age?: number
          min_infant_age?: number
          max_infant_age?: number
          allow_ow_price?: boolean
          allow_rt_price?: boolean
          product_types?: string[]
          combinable_rt_contracts?: string[]
          sync_status?: 'pending' | 'synced' | 'error' | 'modified'
          last_sync_at?: string | null
          sync_error?: string | null
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      flight_segments: {
        Row: {
          id: number
          flight_id: number
          departure_location_code: string
          arrival_location_code: string
          departure_time: string
          arrival_time: string
          plus_days: number
          duration_time: string | null
          model: string | null
          num_service: string | null
          sort_order: number
          created_at: string
        }
        Insert: {
          id?: number
          flight_id: number
          departure_location_code: string
          arrival_location_code: string
          departure_time: string
          arrival_time: string
          plus_days?: number
          duration_time?: string | null
          model?: string | null
          num_service?: string | null
          sort_order?: number
          created_at?: string
        }
        Update: {
          id?: number
          flight_id?: number
          departure_location_code?: string
          arrival_location_code?: string
          departure_time?: string
          arrival_time?: string
          plus_days?: number
          duration_time?: string | null
          model?: string | null
          num_service?: string | null
          sort_order?: number
          created_at?: string
        }
      }
      flight_datasheets: {
        Row: {
          id: number
          flight_id: number
          language: string
          name: string | null
          description: string | null
          created_at: string
        }
        Insert: {
          id?: number
          flight_id: number
          language: string
          name?: string | null
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          flight_id?: number
          language?: string
          name?: string | null
          description?: string | null
          created_at?: string
        }
      }
      flight_cancellations: {
        Row: {
          id: number
          flight_id: number
          days: number
          percentage: number
          created_at: string
        }
        Insert: {
          id?: number
          flight_id: number
          days: number
          percentage: number
          created_at?: string
        }
        Update: {
          id?: number
          flight_id?: number
          days?: number
          percentage?: number
          created_at?: string
        }
      }
      modalities: {
        Row: {
          id: number
          flight_id: number
          code: string
          active: boolean
          cabin_class_type: string
          baggage_allowance: string | null
          baggage_allowance_type: string | null
          min_passengers: number
          max_passengers: number
          on_request: boolean
          sync_status: 'pending' | 'synced' | 'error' | 'modified'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: number
          flight_id: number
          code: string
          active?: boolean
          cabin_class_type: string
          baggage_allowance?: string | null
          baggage_allowance_type?: string | null
          min_passengers?: number
          max_passengers?: number
          on_request?: boolean
          sync_status?: 'pending' | 'synced' | 'error' | 'modified'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: number
          flight_id?: number
          code?: string
          active?: boolean
          cabin_class_type?: string
          baggage_allowance?: string | null
          baggage_allowance_type?: string | null
          min_passengers?: number
          max_passengers?: number
          on_request?: boolean
          sync_status?: 'pending' | 'synced' | 'error' | 'modified'
          created_at?: string
          updated_at?: string
        }
      }
      modality_inventories: {
        Row: {
          id: number
          modality_id: number
          start_date: string
          end_date: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: number
          modality_id: number
          start_date: string
          end_date: string
          quantity: number
          created_at?: string
        }
        Update: {
          id?: number
          modality_id?: number
          start_date?: string
          end_date?: string
          quantity?: number
          created_at?: string
        }
      }
      modality_translations: {
        Row: {
          id: number
          modality_id: number
          language: string
          name: string
          created_at: string
        }
        Insert: {
          id?: number
          modality_id: number
          language: string
          name: string
          created_at?: string
        }
        Update: {
          id?: number
          modality_id?: number
          language?: string
          name?: string
          created_at?: string
        }
      }
      sync_logs: {
        Row: {
          id: number
          entity_type: string
          entity_id: number
          action: 'create' | 'update' | 'delete'
          direction: 'push' | 'pull'
          status: 'success' | 'error'
          request_payload: Json | null
          response_payload: Json | null
          error_message: string | null
          created_by: string | null
          created_at: string
        }
        Insert: {
          id?: number
          entity_type: string
          entity_id: number
          action: 'create' | 'update' | 'delete'
          direction: 'push' | 'pull'
          status: 'success' | 'error'
          request_payload?: Json | null
          response_payload?: Json | null
          error_message?: string | null
          created_by?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          entity_type?: string
          entity_id?: number
          action?: 'create' | 'update' | 'delete'
          direction?: 'push' | 'pull'
          status?: 'success' | 'error'
          request_payload?: Json | null
          response_payload?: Json | null
          error_message?: string | null
          created_by?: string | null
          created_at?: string
        }
      }
      airlines: {
        Row: {
          id: number
          code: string
          name: string
          country: string | null
          created_at: string
        }
        Insert: {
          id?: number
          code: string
          name: string
          country?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          code?: string
          name?: string
          country?: string | null
          created_at?: string
        }
      }
      airports: {
        Row: {
          id: number
          code: string
          name: string
          city: string | null
          country: string | null
          created_at: string
        }
        Insert: {
          id?: number
          code: string
          name: string
          city?: string | null
          country?: string | null
          created_at?: string
        }
        Update: {
          id?: number
          code?: string
          name?: string
          city?: string | null
          country?: string | null
          created_at?: string
        }
      }
      cabin_classes: {
        Row: {
          id: number
          code: string
          name: string
          created_at: string
        }
        Insert: {
          id?: number
          code: string
          name: string
          created_at?: string
        }
        Update: {
          id?: number
          code?: string
          name?: string
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}

// Helper types
export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type InsertTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Insert']
export type UpdateTables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Update']

// Commonly used types
export type Flight = Tables<'flights'>
export type FlightInsert = InsertTables<'flights'>
export type FlightUpdate = UpdateTables<'flights'>

export type FlightSegment = Tables<'flight_segments'>
export type FlightDatasheet = Tables<'flight_datasheets'>
export type FlightCancellation = Tables<'flight_cancellations'>

export type Modality = Tables<'modalities'>
export type ModalityInventory = Tables<'modality_inventories'>
export type ModalityTranslation = Tables<'modality_translations'>

export type SyncLog = Tables<'sync_logs'>
export type Profile = Tables<'profiles'>
export type Airline = Tables<'airlines'>
export type Airport = Tables<'airports'>
export type CabinClass = Tables<'cabin_classes'>
export type Supplier = Tables<'suppliers'>

// Extended types with relations
export type FlightWithRelations = Flight & {
  segments: FlightSegment[]
  datasheets: FlightDatasheet[]
  cancellations: FlightCancellation[]
  modalities: Modality[]
}

export type ModalityWithRelations = Modality & {
  inventories: ModalityInventory[]
  translations: ModalityTranslation[]
}

// ============================================
// Package Types
// ============================================

export type PackageStatus = 'imported' | 'reviewing' | 'approved' | 'in_design' | 'in_marketing' | 'published' | 'expired'

export interface Package {
  id: number
  tc_package_id: number
  title: string
  large_title: string | null
  description: string | null
  image_url: string | null
  external_reference: string | null
  tc_creation_date: string | null
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  original_price_per_pax: number | null
  current_price_per_pax: number | null
  total_price: number | null
  currency: string
  price_variance_pct: number
  adults_count: number
  children_count: number
  infants_count: number
  nights_count: number
  destinations_count: number
  transports_count: number
  hotels_count: number
  transfers_count: number
  cars_count: number
  tickets_count: number
  tours_count: number
  tc_active: boolean
  status: PackageStatus
  needs_manual_quote: boolean
  send_to_design: boolean
  send_to_design_at: string | null
  design_completed: boolean
  design_completed_at: string | null
  send_to_marketing: boolean
  send_to_marketing_at: string | null
  marketing_completed: boolean
  marketing_completed_at: string | null
  seo_title: string | null
  seo_description: string | null
  ai_description: string | null
  in_sitemap: boolean
  origin_code: string | null
  origin_name: string | null
  origin_country: string | null
  themes: string[] | null
  tc_idea_url: string | null
  last_requote_at: string | null
  requote_status: string | null
  manual_quote_completed_at: string | null
  imported_at: string
  last_sync_at: string | null
  created_at: string
  updated_at: string
  // New fields
  available_dates: string[] | null
  package_type: string | null
  min_nights: number | null
  max_nights: number | null
  is_refundable: boolean
  tc_username: string | null
  cancellation_policy: string | null
}

export interface PackageInsert {
  tc_package_id: number
  title: string
  large_title?: string | null
  description?: string | null
  image_url?: string | null
  external_reference?: string | null
  tc_creation_date?: string | null
  departure_date?: string | null
  date_range_start?: string | null
  date_range_end?: string | null
  original_price_per_pax?: number | null
  current_price_per_pax?: number | null
  total_price?: number | null
  currency?: string
  price_variance_pct?: number
  adults_count?: number
  children_count?: number
  nights_count?: number
  destinations_count?: number
  transports_count?: number
  hotels_count?: number
  transfers_count?: number
  cars_count?: number
  tickets_count?: number
  tours_count?: number
  tc_active?: boolean
  status?: PackageStatus
  needs_manual_quote?: boolean
  send_to_design?: boolean
  design_completed?: boolean
  send_to_marketing?: boolean
  marketing_completed?: boolean
  seo_title?: string | null
  seo_description?: string | null
  ai_description?: string | null
  in_sitemap?: boolean
  origin_code?: string | null
  origin_name?: string | null
  origin_country?: string | null
  themes?: string[] | null
  tc_idea_url?: string | null
}

export interface PackageDestination {
  id: number
  package_id: number
  destination_code: string
  destination_name: string
  country: string | null
  country_code: string | null
  from_day: number | null
  to_day: number | null
  nights: number | null
  latitude: number | null
  longitude: number | null
  recommended_airport_code: string | null
  recommended_airport_name: string | null
  description: string | null
  sort_order: number
  created_at: string
}

export interface PackageCostBreakdown {
  id: number
  package_id: number
  sync_date: string
  air_cost: number
  hotel_cost: number
  transfer_cost: number
  car_cost: number
  tour_cost: number
  ticket_cost: number
  insurance_cost: number
  other_cost: number
  operator_fee: number
  agency_fee: number
  payment_fee: number
  total_net_cost: number
  total_fees: number
  final_price_per_pax: number
  currency: string
  created_at: string
}

export interface PackagePriceHistory {
  id: number
  package_id: number
  price_per_pax: number
  total_price: number | null
  currency: string
  previous_price: number | null
  variance_amount: number | null
  variance_pct: number | null
  recorded_at: string
}

export interface PackageTransport {
  id: number
  package_id: number
  tc_transport_id: string | null
  tc_provider_code: string | null
  supplier_name: string | null
  day: number | null
  transport_type: string | null
  direction: string | null
  origin_code: string | null
  origin_name: string | null
  destination_code: string | null
  destination_name: string | null
  company: string | null
  transport_number: string | null
  marketing_airline_code: string | null
  operating_airline_code: string | null
  operating_airline_name: string | null
  departure_date: string | null
  departure_time: string | null
  arrival_date: string | null
  arrival_time: string | null
  duration: string | null
  day_difference: number
  fare: string | null
  fare_class: string | null
  fare_basis: string | null
  cabin_class: string | null
  baggage_info: string | null
  checked_baggage: string | null
  cabin_baggage: string | null
  aircraft_type: string | null
  terminal_departure: string | null
  terminal_arrival: string | null
  num_segments: number
  net_price: number | null
  total_price: number | null
  currency: string
  mandatory: boolean
  is_refundable: boolean
  adults_count: number
  children_count: number
  infants_count: number
  sort_order: number
  created_at: string
}

export interface PackageTransportSegment {
  id: number
  transport_id: number
  departure_airport: string | null
  departure_airport_name: string | null
  arrival_airport: string | null
  arrival_airport_name: string | null
  departure_datetime: string | null
  arrival_datetime: string | null
  flight_number: string | null
  marketing_airline: string | null
  operating_airline: string | null
  booking_class: string | null
  cabin_class: string | null
  baggage_info: string | null
  sort_order: number
  created_at: string
}

export interface PackageHotel {
  id: number
  package_id: number
  tc_hotel_id: string | null
  tc_provider_code: string | null
  tc_datasheet_id: string | null
  supplier_name: string | null
  day: number | null
  hotel_name: string | null
  hotel_category: string | null
  destination_code: string | null
  destination_name: string | null
  check_in_date: string | null
  check_out_date: string | null
  nights: number | null
  room_type: string | null
  room_name: string | null
  board_type: string | null
  board_name: string | null
  description: string | null
  image_url: string | null
  phone: string | null
  email: string | null
  web_url: string | null
  stars: number | null
  overall_rating: number | null
  facilities: string[] | null
  cancellation_policy: string | null
  net_price: number | null
  total_price: number | null
  currency: string
  latitude: number | null
  longitude: number | null
  address: string | null
  mandatory: boolean
  is_refundable: boolean
  adults_count: number
  children_count: number
  infants_count: number
  sort_order: number
  created_at: string
}

export interface PackageTransfer {
  id: number
  package_id: number
  tc_transfer_id: string | null
  tc_provider_code: string | null
  supplier_name: string | null
  day: number | null
  transfer_type: string | null
  from_name: string | null
  from_latitude: number | null
  from_longitude: number | null
  to_name: string | null
  to_latitude: number | null
  to_longitude: number | null
  vehicle_type: string | null
  service_type: string | null
  product_type: string | null
  datetime: string | null
  duration_minutes: number | null
  description: string | null
  image_url: string | null
  net_price: number | null
  total_price: number | null
  currency: string
  mandatory: boolean
  adults_count: number
  children_count: number
  infants_count: number
  sort_order: number
  created_at: string
}

export interface PackageClosedTour {
  id: number
  package_id: number
  tc_tour_id: string | null
  provider_code: string | null
  supplier_id: number | null
  supplier_name: string | null
  day_from: number | null
  day_to: number | null
  start_date: string | null
  end_date: string | null
  name: string | null
  modality_name: string | null
  included_services: string | null
  non_included_services: string | null
  net_price: number | null
  total_price: number | null
  currency: string
  mandatory: boolean
  datasheet_id: string | null
  sort_order: number
  created_at: string
}

export interface PackageCar {
  id: number
  package_id: number
  tc_car_id: string | null
  day_from: number | null
  day_to: number | null
  pickup_date: string | null
  pickup_time: string | null
  pickup_location: string | null
  pickup_latitude: number | null
  pickup_longitude: number | null
  dropoff_date: string | null
  dropoff_time: string | null
  dropoff_location: string | null
  dropoff_latitude: number | null
  dropoff_longitude: number | null
  company: string | null
  category: string | null
  vehicle_name: string | null
  vehicle_type: string | null
  transmission: string | null
  fuel_policy: string | null
  doors: number | null
  seats: number | null
  bags: number | null
  air_conditioning: boolean
  included_km: string | null
  insurance_included: boolean
  net_price: number | null
  total_price: number | null
  price_per_day: number | null
  currency: string
  days_count: number | null
  mandatory: boolean
  sort_order: number
  created_at: string
}

export interface PackageTicket {
  id: number
  package_id: number
  tc_ticket_id: string | null
  day: number | null
  name: string | null
  description: string | null
  category: string | null
  destination_code: string | null
  destination_name: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  ticket_date: string | null
  start_time: string | null
  end_time: string | null
  duration: string | null
  supplier_name: string | null
  modality_name: string | null
  includes: string | null
  net_price: number | null
  total_price: number | null
  currency: string
  mandatory: boolean
  sort_order: number
  created_at: string
}

export interface PackageImage {
  id: number
  package_id: number
  image_type: string | null
  source: string | null
  original_url: string | null
  google_drive_id: string | null
  google_drive_url: string | null
  cdn_url: string | null
  alt_text: string | null
  width: number | null
  height: number | null
  file_size: number | null
  designed_by: string | null
  design_approved: boolean
  design_approved_at: string | null
  sort_order: number
  created_at: string
  updated_at: string
}

export interface PackageWorkflow {
  id: number
  package_id: number
  department: string
  action: string
  from_status: string | null
  to_status: string | null
  assigned_to: string | null
  notes: string | null
  created_at: string
  created_by: string | null
}

export interface PackageSyncLog {
  id: number
  package_id: number
  sync_type: string | null
  status: string | null
  price_changed: boolean
  old_price: number | null
  new_price: number | null
  details: Json | null
  error_message: string | null
  created_at: string
}

// ============================================
// NEW: Hotel Images
// ============================================
export interface PackageHotelImage {
  id: number
  hotel_id: number
  image_url: string
  alt_text: string | null
  width: number | null
  height: number | null
  sort_order: number
  created_at: string
}

// ============================================
// NEW: Hotel Rooms (room types with board/meal plans)
// ============================================
export interface PackageHotelRoom {
  id: number
  hotel_id: number
  room_code: string | null
  room_name: string
  room_description: string | null
  board_code: string | null // RO, BB, HB, FB, AI
  board_name: string | null // Room Only, Bed & Breakfast, etc
  board_description: string | null
  adults_capacity: number
  children_capacity: number
  infants_capacity: number
  net_price: number | null
  total_price: number | null
  currency: string
  is_refundable: boolean
  cancellation_deadline: string | null
  sort_order: number
  created_at: string
}

// ============================================
// NEW: Service Prices (detailed price breakdown per service)
// ============================================
export type ServiceType = 'hotel' | 'transport' | 'transfer' | 'ticket' | 'tour' | 'car' | 'insurance'

export interface PackageServicePrice {
  id: number
  package_id: number
  service_type: ServiceType
  service_id: number | null
  net_provider: number
  operator_fee: number
  agency_fee: number
  commission: number
  taxes: number
  final_price: number
  adult_price: number | null
  child_price: number | null
  infant_price: number | null
  currency: string
  created_at: string
}

// ============================================
// NEW: Insurances
// ============================================
export interface PackageInsurance {
  id: number
  package_id: number
  tc_insurance_id: string | null
  day_from: number | null
  day_to: number | null
  provider_code: string | null
  supplier_name: string | null
  name: string | null
  description: string | null
  coverage: string | null
  net_price: number | null
  total_price: number | null
  currency: string
  mandatory: boolean
  adults_count: number
  children_count: number
  sort_order: number
  created_at: string
}

// Extended package type with relations
export interface PackageWithRelations extends Package {
  destinations?: PackageDestination[]
  cost_breakdown?: PackageCostBreakdown[]
  price_history?: PackagePriceHistory[]
  transports?: PackageTransport[]
  hotels?: PackageHotelWithRelations[]
  transfers?: PackageTransfer[]
  closed_tours?: PackageClosedTour[]
  cars?: PackageCar[]
  tickets?: PackageTicket[]
  images?: PackageImage[]
  insurances?: PackageInsurance[]
  service_prices?: PackageServicePrice[]
}

// Hotel with nested relations
export interface PackageHotelWithRelations extends PackageHotel {
  images?: PackageHotelImage[]
  rooms?: PackageHotelRoom[]
}
