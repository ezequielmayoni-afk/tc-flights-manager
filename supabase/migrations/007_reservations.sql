-- TC Flights Manager - Reservations from TravelCompositor
-- Run this in your Supabase SQL Editor

-- =====================================================
-- RESERVATIONS (bookings from TravelCompositor webhooks)
-- =====================================================
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,

  -- TC booking identifiers
  booking_reference TEXT NOT NULL UNIQUE,  -- "SIV-TRANSPORT-185447"
  tc_service_id TEXT NOT NULL,             -- "SIV-11-0" from transportservice.id
  tc_transport_id TEXT,                    -- Links to our tc_transport_id

  -- Provider info
  provider TEXT,                           -- "CONTRACT_TRANSPORT"
  provider_description TEXT,               -- "Contract Transport Sí, viajo"
  provider_configuration_id INTEGER,       -- 13720

  -- Link to our flight
  flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL,

  -- Reservation status: confirmed, modified, cancelled
  status TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'modified', 'cancelled')),

  -- Passenger counts
  adults INTEGER DEFAULT 0,
  children INTEGER DEFAULT 0,
  infants INTEGER DEFAULT 0,
  total_passengers INTEGER GENERATED ALWAYS AS (adults + children + infants) STORED,

  -- Pricing
  total_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',

  -- Dates
  travel_date DATE,            -- Date of the flight/travel
  reservation_date TIMESTAMPTZ DEFAULT NOW(),  -- When the booking was made
  modification_date TIMESTAMPTZ,  -- Last modification date
  cancellation_date TIMESTAMPTZ,  -- When cancelled (if applicable)

  -- Full webhook payload for reference
  webhook_payload JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_reservations_booking_reference ON reservations(booking_reference);
CREATE INDEX idx_reservations_tc_transport_id ON reservations(tc_transport_id);
CREATE INDEX idx_reservations_flight_id ON reservations(flight_id);
CREATE INDEX idx_reservations_status ON reservations(status);
CREATE INDEX idx_reservations_reservation_date ON reservations(reservation_date);
CREATE INDEX idx_reservations_travel_date ON reservations(travel_date);

-- RLS Policies
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view reservations"
  ON reservations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert reservations"
  ON reservations FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update reservations"
  ON reservations FOR UPDATE
  TO authenticated
  USING (true);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_reservations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER reservations_updated_at
  BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_reservations_updated_at();

-- =====================================================
-- Update modality_inventories to track sold seats
-- =====================================================
-- Add 'sold' column if it doesn't exist (it should already exist from migration 003)
-- This is just for reference - the column should already be there

-- =====================================================
-- View for reservation analytics
-- =====================================================
CREATE OR REPLACE VIEW reservation_stats AS
SELECT
  DATE_TRUNC('day', reservation_date) as date,
  COUNT(*) as total_reservations,
  SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed,
  SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
  SUM(CASE WHEN status = 'modified' THEN 1 ELSE 0 END) as modified,
  SUM(total_passengers) as total_passengers,
  SUM(total_amount) as total_revenue
FROM reservations
GROUP BY DATE_TRUNC('day', reservation_date)
ORDER BY date DESC;
