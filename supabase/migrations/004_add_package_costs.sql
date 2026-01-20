-- Migration: Add cost breakdown columns to packages
-- Description: Columns for air cost, land cost, agency fee, and flight info

-- Add cost breakdown columns
ALTER TABLE packages ADD COLUMN IF NOT EXISTS air_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS land_cost DECIMAL(10,2) DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS agency_fee DECIMAL(10,2) DEFAULT 0;

-- Flight info
ALTER TABLE packages ADD COLUMN IF NOT EXISTS flight_departure_date DATE;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS airline_code TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS airline_name TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS flight_numbers TEXT;

-- Comments
COMMENT ON COLUMN packages.air_cost IS 'Total cost of all transports (flights)';
COMMENT ON COLUMN packages.land_cost IS 'Total cost of hotels + transfers + tours + tickets + cars';
COMMENT ON COLUMN packages.agency_fee IS 'Agency fee from price breakdown';
COMMENT ON COLUMN packages.flight_departure_date IS 'Departure date of the first flight';
COMMENT ON COLUMN packages.airline_code IS 'Marketing airline code (e.g. AR, DM)';
COMMENT ON COLUMN packages.airline_name IS 'Airline company name';
COMMENT ON COLUMN packages.flight_numbers IS 'Flight numbers (e.g. DM6463/DM6464)';
