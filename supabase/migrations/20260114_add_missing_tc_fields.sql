-- Migration: Add missing TravelCompositor fields
-- Description: Adds fields for hotels details, rooms, hotel images, and more complete TC data

-- ============================================
-- 1. PACKAGES - Add missing fields
-- ============================================
ALTER TABLE packages ADD COLUMN IF NOT EXISTS available_dates DATE[];
ALTER TABLE packages ADD COLUMN IF NOT EXISTS package_type TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS min_nights INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS max_nights INTEGER;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS is_refundable BOOLEAN DEFAULT true;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS tc_username TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

COMMENT ON COLUMN packages.available_dates IS 'Available departure dates from TC availRange';
COMMENT ON COLUMN packages.package_type IS 'Type: FLIGHT_HOTEL, MULTI, HOTEL_ONLY, etc';
COMMENT ON COLUMN packages.tc_username IS 'TC user who created/owns the package';

-- ============================================
-- 2. PACKAGE_DESTINATIONS - Add missing fields
-- ============================================
ALTER TABLE package_destinations ADD COLUMN IF NOT EXISTS nights INTEGER;
ALTER TABLE package_destinations ADD COLUMN IF NOT EXISTS country_code TEXT;

-- ============================================
-- 3. PACKAGE_HOTELS - Add missing fields
-- ============================================
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS tc_provider_code TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS tc_datasheet_id TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS web_url TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS stars INTEGER;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS overall_rating DECIMAL(3,1);
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS facilities TEXT[];
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;
ALTER TABLE package_hotels ADD COLUMN IF NOT EXISTS is_refundable BOOLEAN DEFAULT true;

COMMENT ON COLUMN package_hotels.tc_provider_code IS 'Provider code like BEDSVIA, HOTELBEDS, etc';
COMMENT ON COLUMN package_hotels.facilities IS 'Array of facility names: WiFi, Pool, Spa, etc';
COMMENT ON COLUMN package_hotels.overall_rating IS 'Rating from 1.0 to 10.0';

-- ============================================
-- 4. NEW TABLE: PACKAGE_HOTEL_IMAGES
-- ============================================
CREATE TABLE IF NOT EXISTS package_hotel_images (
  id SERIAL PRIMARY KEY,
  hotel_id INTEGER REFERENCES package_hotels(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_hotel_images_hotel ON package_hotel_images(hotel_id);

COMMENT ON TABLE package_hotel_images IS 'Hotel images from TravelCompositor hotelData';

-- ============================================
-- 5. NEW TABLE: PACKAGE_HOTEL_ROOMS
-- ============================================
CREATE TABLE IF NOT EXISTS package_hotel_rooms (
  id SERIAL PRIMARY KEY,
  hotel_id INTEGER REFERENCES package_hotels(id) ON DELETE CASCADE,

  -- Room info
  room_code TEXT,
  room_name TEXT NOT NULL,
  room_description TEXT,

  -- Board/Meal plan
  board_code TEXT,
  board_name TEXT,
  board_description TEXT,

  -- Capacity
  adults_capacity INTEGER DEFAULT 2,
  children_capacity INTEGER DEFAULT 0,
  infants_capacity INTEGER DEFAULT 0,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Conditions
  is_refundable BOOLEAN DEFAULT true,
  cancellation_deadline DATE,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_hotel_rooms_hotel ON package_hotel_rooms(hotel_id);

COMMENT ON TABLE package_hotel_rooms IS 'Hotel room types with board/meal plans';
COMMENT ON COLUMN package_hotel_rooms.board_code IS 'Board code: RO (Room Only), BB (Bed & Breakfast), HB (Half Board), FB (Full Board), AI (All Inclusive)';
COMMENT ON COLUMN package_hotel_rooms.board_name IS 'Display name: Desayuno incluido, Todo Incluido, etc';

-- ============================================
-- 6. PACKAGE_TRANSPORTS - Add missing fields
-- ============================================
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS operating_airline_code TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS operating_airline_name TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS aircraft_type TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS checked_baggage TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS cabin_baggage TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS fare_class TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS fare_basis TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS is_refundable BOOLEAN DEFAULT true;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS terminal_departure TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS terminal_arrival TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS tc_provider_code TEXT;
ALTER TABLE package_transports ADD COLUMN IF NOT EXISTS supplier_name TEXT;

COMMENT ON COLUMN package_transports.operating_airline_code IS 'Actual airline operating the flight (may differ from marketing)';
COMMENT ON COLUMN package_transports.fare_class IS 'Booking class like Y, B, M, etc';
COMMENT ON COLUMN package_transports.checked_baggage IS 'Included checked baggage, e.g., 23kg, 2PC';
COMMENT ON COLUMN package_transports.cabin_baggage IS 'Included cabin baggage, e.g., 10kg, 1PC';

-- ============================================
-- 7. PACKAGE_TRANSPORT_SEGMENTS - Add missing fields
-- ============================================
ALTER TABLE package_transport_segments ADD COLUMN IF NOT EXISTS aircraft_type TEXT;
ALTER TABLE package_transport_segments ADD COLUMN IF NOT EXISTS terminal_departure TEXT;
ALTER TABLE package_transport_segments ADD COLUMN IF NOT EXISTS terminal_arrival TEXT;
ALTER TABLE package_transport_segments ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- ============================================
-- 8. PACKAGE_TRANSFERS - Add missing fields
-- ============================================
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS tc_provider_code TEXT;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;
ALTER TABLE package_transfers ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================
-- 9. PACKAGE_TICKETS - Add missing fields
-- ============================================
ALTER TABLE package_tickets ADD COLUMN IF NOT EXISTS tc_provider_code TEXT;
ALTER TABLE package_tickets ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE package_tickets ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE package_tickets ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE package_tickets ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;

-- ============================================
-- 10. PACKAGE_CLOSED_TOURS - Add missing fields
-- ============================================
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS adults_count INTEGER DEFAULT 2;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS children_count INTEGER DEFAULT 0;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS infants_count INTEGER DEFAULT 0;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS destination_code TEXT;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS destination_name TEXT;
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,7);
ALTER TABLE package_closed_tours ADD COLUMN IF NOT EXISTS longitude DECIMAL(10,7);

-- ============================================
-- 11. PACKAGE_CARS - Add missing fields
-- ============================================
ALTER TABLE package_cars ADD COLUMN IF NOT EXISTS tc_provider_code TEXT;
ALTER TABLE package_cars ADD COLUMN IF NOT EXISTS supplier_name TEXT;
ALTER TABLE package_cars ADD COLUMN IF NOT EXISTS image_url TEXT;

-- ============================================
-- 12. NEW TABLE: PACKAGE_SERVICE_PRICES
-- Detailed price breakdown per service (from TC priceBreakdown)
-- ============================================
CREATE TABLE IF NOT EXISTS package_service_prices (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  -- Service reference
  service_type TEXT NOT NULL, -- 'hotel', 'transport', 'transfer', 'ticket', 'tour', 'car', 'insurance'
  service_id INTEGER, -- FK to respective table (hotel_id, transport_id, etc)

  -- Price components
  net_provider DECIMAL(10,2) DEFAULT 0, -- Cost from provider
  operator_fee DECIMAL(10,2) DEFAULT 0, -- TC operator fee
  agency_fee DECIMAL(10,2) DEFAULT 0, -- Agency markup
  commission DECIMAL(10,2) DEFAULT 0, -- Commission
  taxes DECIMAL(10,2) DEFAULT 0, -- Taxes
  final_price DECIMAL(10,2) DEFAULT 0, -- Final price

  -- Per-pax breakdown
  adult_price DECIMAL(10,2),
  child_price DECIMAL(10,2),
  infant_price DECIMAL(10,2),

  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_service_prices_package ON package_service_prices(package_id);
CREATE INDEX IF NOT EXISTS idx_package_service_prices_type ON package_service_prices(service_type);

COMMENT ON TABLE package_service_prices IS 'Detailed price breakdown per service from TC priceBreakdown';
COMMENT ON COLUMN package_service_prices.net_provider IS 'Net cost paid to provider';
COMMENT ON COLUMN package_service_prices.operator_fee IS 'Fee charged by TravelCompositor';
COMMENT ON COLUMN package_service_prices.agency_fee IS 'Fee/markup added by the agency';

-- ============================================
-- 13. NEW TABLE: PACKAGE_INSURANCES
-- ============================================
CREATE TABLE IF NOT EXISTS package_insurances (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_insurance_id TEXT,

  day_from INTEGER,
  day_to INTEGER,

  -- Insurance info
  provider_code TEXT,
  supplier_name TEXT,
  name TEXT,
  description TEXT,
  coverage TEXT,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  mandatory BOOLEAN DEFAULT false,
  adults_count INTEGER DEFAULT 2,
  children_count INTEGER DEFAULT 0,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_package_insurances_package ON package_insurances(package_id);

COMMENT ON TABLE package_insurances IS 'Travel insurance included in the package';

-- ============================================
-- 14. UPDATE PACKAGE_COST_BREAKDOWN
-- Add more granular breakdown
-- ============================================
ALTER TABLE package_cost_breakdown ADD COLUMN IF NOT EXISTS net_provider_total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE package_cost_breakdown ADD COLUMN IF NOT EXISTS taxes_total DECIMAL(10,2) DEFAULT 0;
ALTER TABLE package_cost_breakdown ADD COLUMN IF NOT EXISTS commission_total DECIMAL(10,2) DEFAULT 0;

-- ============================================
-- Grant permissions for new tables
-- ============================================
-- If RLS is enabled, you may need to add policies
-- The following assumes authenticated users can manage these records

DO $$
BEGIN
  -- Check if RLS is enabled on packages (our reference table)
  IF EXISTS (
    SELECT 1 FROM pg_tables
    WHERE tablename = 'packages'
    AND rowsecurity = true
  ) THEN
    -- Enable RLS on new tables
    ALTER TABLE package_hotel_images ENABLE ROW LEVEL SECURITY;
    ALTER TABLE package_hotel_rooms ENABLE ROW LEVEL SECURITY;
    ALTER TABLE package_service_prices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE package_insurances ENABLE ROW LEVEL SECURITY;

    -- Create policies
    CREATE POLICY "Authenticated users can manage hotel_images" ON package_hotel_images
      FOR ALL USING (auth.uid() IS NOT NULL);

    CREATE POLICY "Authenticated users can manage hotel_rooms" ON package_hotel_rooms
      FOR ALL USING (auth.uid() IS NOT NULL);

    CREATE POLICY "Authenticated users can manage service_prices" ON package_service_prices
      FOR ALL USING (auth.uid() IS NOT NULL);

    CREATE POLICY "Authenticated users can manage insurances" ON package_insurances
      FOR ALL USING (auth.uid() IS NOT NULL);
  END IF;
EXCEPTION
  WHEN others THEN
    -- Policies may already exist or RLS not enabled
    NULL;
END;
$$;
