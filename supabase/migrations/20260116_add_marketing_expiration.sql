-- Add marketing expiration date to packages
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_expiration_date DATE;

-- Add index for quick lookup of expired packages
CREATE INDEX IF NOT EXISTS idx_packages_marketing_expiration
ON packages(marketing_expiration_date)
WHERE send_to_marketing = true;
