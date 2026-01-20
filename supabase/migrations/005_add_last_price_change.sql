-- Migration: Add last_price_change_at column to packages
-- Description: Track when the price was last changed for each package

ALTER TABLE packages ADD COLUMN IF NOT EXISTS last_price_change_at TIMESTAMPTZ;

-- Create index for sorting by last price change
CREATE INDEX IF NOT EXISTS idx_packages_last_price_change ON packages(last_price_change_at DESC NULLS LAST);

-- Backfill from package_price_history (get the latest recorded_at for each package)
UPDATE packages p
SET last_price_change_at = (
  SELECT MAX(recorded_at)
  FROM package_price_history ph
  WHERE ph.package_id = p.id
)
WHERE EXISTS (
  SELECT 1 FROM package_price_history ph WHERE ph.package_id = p.id
);

COMMENT ON COLUMN packages.last_price_change_at IS 'Timestamp of the last price change detected during sync';
