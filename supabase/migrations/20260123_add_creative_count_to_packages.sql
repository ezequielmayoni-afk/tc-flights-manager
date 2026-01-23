-- Migration: Add creative_count column to packages table
-- Purpose: Cache the count of creatives per package to avoid Google Drive API calls on page load

-- Add the column with default 0
ALTER TABLE packages
ADD COLUMN IF NOT EXISTS creative_count INTEGER DEFAULT 0;

-- Create index for faster queries when filtering by creative count
CREATE INDEX IF NOT EXISTS idx_packages_creative_count ON packages(creative_count);

-- Add comment
COMMENT ON COLUMN packages.creative_count IS 'Cached count of creatives in Google Drive. Updated on upload/delete.';

-- Update existing packages with their creative counts (will be done via API/script)
-- For now, set all to 0 - the system will update them as creatives are managed
