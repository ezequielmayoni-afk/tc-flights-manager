-- Migration: Add packages module tables
-- Description: Tables for managing travel packages from TravelCompositor

-- ============================================
-- 1. PACKAGES - Main table
-- ============================================
CREATE TABLE packages (
  id SERIAL PRIMARY KEY,
  tc_package_id INTEGER UNIQUE NOT NULL,

  -- Basic info (from TC)
  title TEXT NOT NULL,
  large_title TEXT,
  description TEXT,
  image_url TEXT,
  external_reference TEXT,

  -- Dates
  tc_creation_date DATE,
  departure_date DATE,
  date_range_start DATE,
  date_range_end DATE,

  -- Prices (snapshot on import)
  original_price_per_pax DECIMAL(10,2),
  current_price_per_pax DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  price_variance_pct DECIMAL(5,2) DEFAULT 0,

  -- Counters (from TC)
  adults_count INTEGER DEFAULT 2,
  children_count INTEGER DEFAULT 0,
  nights_count INTEGER DEFAULT 0,
  destinations_count INTEGER DEFAULT 0,
  transports_count INTEGER DEFAULT 0,
  hotels_count INTEGER DEFAULT 0,
  transfers_count INTEGER DEFAULT 0,
  cars_count INTEGER DEFAULT 0,
  tickets_count INTEGER DEFAULT 0,
  tours_count INTEGER DEFAULT 0,

  -- Status and flags
  tc_active BOOLEAN DEFAULT true,
  status TEXT DEFAULT 'imported',
  needs_manual_quote BOOLEAN DEFAULT false,

  -- Workflow flags
  send_to_design BOOLEAN DEFAULT false,
  design_completed BOOLEAN DEFAULT false,
  design_completed_at TIMESTAMPTZ,
  send_to_marketing BOOLEAN DEFAULT false,
  marketing_completed BOOLEAN DEFAULT false,
  marketing_completed_at TIMESTAMPTZ,

  -- SEO (AI generated)
  seo_title TEXT,
  seo_description TEXT,
  ai_description TEXT,
  in_sitemap BOOLEAN DEFAULT false,

  -- Origin
  origin_code TEXT,
  origin_name TEXT,
  origin_country TEXT,

  -- Themes/Tags
  themes TEXT[],

  -- URLs
  tc_idea_url TEXT,

  -- Playwright automation
  last_requote_at TIMESTAMPTZ,
  requote_status TEXT,

  -- Metadata
  imported_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for common queries
CREATE INDEX idx_packages_tc_id ON packages(tc_package_id);
CREATE INDEX idx_packages_status ON packages(status);
CREATE INDEX idx_packages_needs_quote ON packages(needs_manual_quote) WHERE needs_manual_quote = true;
CREATE INDEX idx_packages_date_range ON packages(date_range_start, date_range_end);

-- ============================================
-- 2. PACKAGE_DESTINATIONS - Destinations in the package
-- ============================================
CREATE TABLE package_destinations (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  destination_code TEXT NOT NULL,
  destination_name TEXT NOT NULL,
  country TEXT,
  from_day INTEGER,
  to_day INTEGER,

  -- Geo
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),

  -- Recommended airport
  recommended_airport_code TEXT,
  recommended_airport_name TEXT,

  description TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_destinations_package ON package_destinations(package_id);

-- ============================================
-- 3. PACKAGE_COST_BREAKDOWN - Cost breakdown per sync
-- ============================================
CREATE TABLE package_cost_breakdown (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  sync_date DATE NOT NULL,

  -- Net costs by service
  air_cost DECIMAL(10,2) DEFAULT 0,
  hotel_cost DECIMAL(10,2) DEFAULT 0,
  transfer_cost DECIMAL(10,2) DEFAULT 0,
  car_cost DECIMAL(10,2) DEFAULT 0,
  tour_cost DECIMAL(10,2) DEFAULT 0,
  ticket_cost DECIMAL(10,2) DEFAULT 0,
  insurance_cost DECIMAL(10,2) DEFAULT 0,
  other_cost DECIMAL(10,2) DEFAULT 0,

  -- Fees
  operator_fee DECIMAL(10,2) DEFAULT 0,
  agency_fee DECIMAL(10,2) DEFAULT 0,
  payment_fee DECIMAL(10,2) DEFAULT 0,

  -- Totals
  total_net_cost DECIMAL(10,2) DEFAULT 0,
  total_fees DECIMAL(10,2) DEFAULT 0,
  final_price_per_pax DECIMAL(10,2) DEFAULT 0,

  currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(package_id, sync_date)
);

CREATE INDEX idx_package_cost_breakdown_package ON package_cost_breakdown(package_id);

-- ============================================
-- 4. PACKAGE_PRICE_HISTORY - Price history for variance detection
-- ============================================
CREATE TABLE package_price_history (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  price_per_pax DECIMAL(10,2) NOT NULL,
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Variance from previous
  previous_price DECIMAL(10,2),
  variance_amount DECIMAL(10,2),
  variance_pct DECIMAL(5,2),

  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_price_history_package_date ON package_price_history(package_id, recorded_at DESC);

-- ============================================
-- 5. PACKAGE_TRANSPORTS - Flights in the package
-- ============================================
CREATE TABLE package_transports (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_transport_id TEXT,

  day INTEGER,
  transport_type TEXT,
  direction TEXT,

  -- Origin/Destination
  origin_code TEXT,
  origin_name TEXT,
  destination_code TEXT,
  destination_name TEXT,

  -- Flight info
  company TEXT,
  transport_number TEXT,
  marketing_airline_code TEXT,

  -- Times
  departure_date DATE,
  departure_time TIME,
  arrival_date DATE,
  arrival_time TIME,
  duration TEXT,
  day_difference INTEGER DEFAULT 0,

  -- Additional info
  fare TEXT,
  cabin_class TEXT,
  baggage_info TEXT,
  num_segments INTEGER DEFAULT 1,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  mandatory BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_transports_package ON package_transports(package_id);

-- ============================================
-- 6. PACKAGE_TRANSPORT_SEGMENTS - Flight segments/legs
-- ============================================
CREATE TABLE package_transport_segments (
  id SERIAL PRIMARY KEY,
  transport_id INTEGER REFERENCES package_transports(id) ON DELETE CASCADE,

  departure_airport TEXT,
  departure_airport_name TEXT,
  arrival_airport TEXT,
  arrival_airport_name TEXT,

  departure_datetime TIMESTAMPTZ,
  arrival_datetime TIMESTAMPTZ,

  flight_number TEXT,
  marketing_airline TEXT,
  operating_airline TEXT,
  booking_class TEXT,
  cabin_class TEXT,
  baggage_info TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_transport_segments_transport ON package_transport_segments(transport_id);

-- ============================================
-- 7. PACKAGE_HOTELS - Hotels in the package
-- ============================================
CREATE TABLE package_hotels (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_hotel_id TEXT,

  day INTEGER,

  -- Hotel info
  hotel_name TEXT,
  hotel_category TEXT,
  destination_code TEXT,
  destination_name TEXT,

  -- Dates
  check_in_date DATE,
  check_out_date DATE,
  nights INTEGER,

  -- Room
  room_type TEXT,
  room_name TEXT,
  board_type TEXT,
  board_name TEXT,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Geo
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  address TEXT,

  mandatory BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_hotels_package ON package_hotels(package_id);

-- ============================================
-- 8. PACKAGE_TRANSFERS - Transfers
-- ============================================
CREATE TABLE package_transfers (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_transfer_id TEXT,

  day INTEGER,
  transfer_type TEXT,

  -- From/To
  from_name TEXT,
  from_latitude DECIMAL(10,7),
  from_longitude DECIMAL(10,7),
  to_name TEXT,
  to_latitude DECIMAL(10,7),
  to_longitude DECIMAL(10,7),

  -- Info
  vehicle_type TEXT,
  service_type TEXT,
  product_type TEXT,
  datetime TIMESTAMPTZ,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  mandatory BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_transfers_package ON package_transfers(package_id);

-- ============================================
-- 9. PACKAGE_CLOSED_TOURS - Closed tours
-- ============================================
CREATE TABLE package_closed_tours (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_tour_id TEXT,

  provider_code TEXT,
  supplier_id INTEGER,
  supplier_name TEXT,

  day_from INTEGER,
  day_to INTEGER,
  start_date DATE,
  end_date DATE,

  name TEXT,
  modality_name TEXT,

  included_services TEXT,
  non_included_services TEXT,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  mandatory BOOLEAN DEFAULT false,
  datasheet_id TEXT,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_closed_tours_package ON package_closed_tours(package_id);

-- ============================================
-- 10. PACKAGE_CARS - Rental cars
-- ============================================
CREATE TABLE package_cars (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_car_id TEXT,

  day_from INTEGER,
  day_to INTEGER,

  -- Pickup
  pickup_date DATE,
  pickup_time TIME,
  pickup_location TEXT,
  pickup_latitude DECIMAL(10,7),
  pickup_longitude DECIMAL(10,7),

  -- Dropoff
  dropoff_date DATE,
  dropoff_time TIME,
  dropoff_location TEXT,
  dropoff_latitude DECIMAL(10,7),
  dropoff_longitude DECIMAL(10,7),

  -- Vehicle
  company TEXT,
  category TEXT,
  vehicle_name TEXT,
  vehicle_type TEXT,
  transmission TEXT,
  fuel_policy TEXT,
  doors INTEGER,
  seats INTEGER,
  bags INTEGER,
  air_conditioning BOOLEAN DEFAULT true,

  -- Extras
  included_km TEXT,
  insurance_included BOOLEAN DEFAULT false,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  price_per_day DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  days_count INTEGER,
  mandatory BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_cars_package ON package_cars(package_id);

-- ============================================
-- 11. PACKAGE_TICKETS - Tickets/Excursions
-- ============================================
CREATE TABLE package_tickets (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,
  tc_ticket_id TEXT,

  day INTEGER,

  -- Ticket info
  name TEXT,
  description TEXT,
  category TEXT,

  -- Location
  destination_code TEXT,
  destination_name TEXT,
  location_name TEXT,
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),

  -- Date/Time
  ticket_date DATE,
  start_time TIME,
  end_time TIME,
  duration TEXT,

  -- Details
  supplier_name TEXT,
  modality_name TEXT,
  includes TEXT,

  -- Price
  net_price DECIMAL(10,2),
  total_price DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  mandatory BOOLEAN DEFAULT false,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_tickets_package ON package_tickets(package_id);

-- ============================================
-- 12. PACKAGE_IMAGES - Images (TC + Google Drive)
-- ============================================
CREATE TABLE package_images (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  image_type TEXT,
  source TEXT,

  -- URLs
  original_url TEXT,
  google_drive_id TEXT,
  google_drive_url TEXT,
  cdn_url TEXT,

  -- Metadata
  alt_text TEXT,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,

  -- For design
  designed_by TEXT,
  design_approved BOOLEAN DEFAULT false,
  design_approved_at TIMESTAMPTZ,

  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_images_package ON package_images(package_id);

-- ============================================
-- 13. PACKAGE_WORKFLOW - Workflow history
-- ============================================
CREATE TABLE package_workflow (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  department TEXT NOT NULL,
  action TEXT NOT NULL,

  from_status TEXT,
  to_status TEXT,

  assigned_to TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT
);

CREATE INDEX idx_package_workflow_package ON package_workflow(package_id);
CREATE INDEX idx_package_workflow_department ON package_workflow(department);

-- ============================================
-- 14. PACKAGE_SYNC_LOGS - Sync logs
-- ============================================
CREATE TABLE package_sync_logs (
  id SERIAL PRIMARY KEY,
  package_id INTEGER REFERENCES packages(id) ON DELETE CASCADE,

  sync_type TEXT,
  status TEXT,

  -- Detected changes
  price_changed BOOLEAN DEFAULT false,
  old_price DECIMAL(10,2),
  new_price DECIMAL(10,2),

  details JSONB,
  error_message TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_sync_logs_package ON package_sync_logs(package_id);
CREATE INDEX idx_package_sync_logs_status ON package_sync_logs(status);

-- ============================================
-- 15. PACKAGE_DESTINATION_IMAGES - Images per destination (from TC)
-- ============================================
CREATE TABLE package_destination_images (
  id SERIAL PRIMARY KEY,
  destination_id INTEGER REFERENCES package_destinations(id) ON DELETE CASCADE,

  image_url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_package_destination_images_destination ON package_destination_images(destination_id);

-- ============================================
-- Add updated_at trigger for packages
-- ============================================
CREATE OR REPLACE FUNCTION update_packages_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_packages_updated_at
  BEFORE UPDATE ON packages
  FOR EACH ROW
  EXECUTE FUNCTION update_packages_updated_at();

-- ============================================
-- Comments for documentation
-- ============================================
COMMENT ON TABLE packages IS 'Main table for travel packages imported from TravelCompositor';
COMMENT ON COLUMN packages.status IS 'Workflow status: imported, reviewing, approved, in_design, in_marketing, published, expired';
COMMENT ON COLUMN packages.needs_manual_quote IS 'True if price variance exceeds threshold (5-10%)';
COMMENT ON COLUMN packages.price_variance_pct IS 'Percentage difference between original and current price';

COMMENT ON TABLE package_cost_breakdown IS 'Detailed cost breakdown per sync date for margin analysis';
COMMENT ON TABLE package_price_history IS 'Historical price tracking for variance detection';
COMMENT ON TABLE package_workflow IS 'Audit trail of workflow actions and status changes';
