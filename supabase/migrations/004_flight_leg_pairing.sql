-- Migration: Add leg_type and paired_flight_id for outbound/return flight pairing
-- This allows creating separate flights for outbound and return legs that can be combined in TravelCompositor

-- Add leg_type column to identify if flight is outbound or return
ALTER TABLE flights
ADD COLUMN IF NOT EXISTS leg_type TEXT CHECK (leg_type IN ('outbound', 'return'));

-- Add paired_flight_id to link outbound <-> return flights
ALTER TABLE flights
ADD COLUMN IF NOT EXISTS paired_flight_id INTEGER REFERENCES flights(id) ON DELETE SET NULL;

-- Add index for faster paired flight lookups
CREATE INDEX IF NOT EXISTS idx_flights_paired_flight_id ON flights(paired_flight_id);

-- Add index for leg_type filtering
CREATE INDEX IF NOT EXISTS idx_flights_leg_type ON flights(leg_type);

-- Comment for documentation
COMMENT ON COLUMN flights.leg_type IS 'Type of flight leg: outbound (ida) or return (vuelta)';
COMMENT ON COLUMN flights.paired_flight_id IS 'Links to the paired flight (outbound links to return and vice versa)';
