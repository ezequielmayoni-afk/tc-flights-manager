-- Migration: Add leg_type to flight_segments
-- Each segment can be marked as outbound or return
-- This allows grouping segments by leg type when creating paired flights

-- Add leg_type column to flight_segments
ALTER TABLE flight_segments
ADD COLUMN IF NOT EXISTS leg_type TEXT CHECK (leg_type IN ('outbound', 'return')) DEFAULT 'outbound';

-- Add index for faster leg_type filtering
CREATE INDEX IF NOT EXISTS idx_flight_segments_leg_type ON flight_segments(leg_type);

-- Comment for documentation
COMMENT ON COLUMN flight_segments.leg_type IS 'Type of segment leg: outbound (ida) or return (vuelta)';
