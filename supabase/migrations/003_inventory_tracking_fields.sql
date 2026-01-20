-- Migration: Add sold and remaining_seats columns to modality_inventories
-- These columns will be used to track inventory usage

ALTER TABLE modality_inventories
ADD COLUMN IF NOT EXISTS sold INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS remaining_seats INTEGER;

-- Set remaining_seats based on quantity - sold (for existing rows)
UPDATE modality_inventories
SET remaining_seats = quantity - COALESCE(sold, 0)
WHERE remaining_seats IS NULL;

-- Add a trigger to auto-calculate remaining_seats when sold changes
CREATE OR REPLACE FUNCTION update_remaining_seats()
RETURNS TRIGGER AS $$
BEGIN
  NEW.remaining_seats := NEW.quantity - COALESCE(NEW.sold, 0);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_remaining_seats ON modality_inventories;

CREATE TRIGGER trigger_update_remaining_seats
BEFORE INSERT OR UPDATE ON modality_inventories
FOR EACH ROW
EXECUTE FUNCTION update_remaining_seats();
