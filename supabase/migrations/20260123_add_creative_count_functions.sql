-- Migration: Add atomic functions for creative_count management
-- Purpose: Ensure reliable increment/decrement operations

-- Function to increment creative_count atomically
CREATE OR REPLACE FUNCTION increment_creative_count(package_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE packages
  SET creative_count = COALESCE(creative_count, 0) + 1
  WHERE id = package_id_param
  RETURNING creative_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to decrement creative_count atomically (never goes below 0)
CREATE OR REPLACE FUNCTION decrement_creative_count(package_id_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE packages
  SET creative_count = GREATEST(COALESCE(creative_count, 0) - 1, 0)
  WHERE id = package_id_param
  RETURNING creative_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

-- Function to set creative_count to a specific value (for sync)
CREATE OR REPLACE FUNCTION set_creative_count(package_id_param INTEGER, count_param INTEGER)
RETURNS INTEGER AS $$
DECLARE
  new_count INTEGER;
BEGIN
  UPDATE packages
  SET creative_count = GREATEST(count_param, 0)
  WHERE id = package_id_param
  RETURNING creative_count INTO new_count;

  RETURN COALESCE(new_count, 0);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION increment_creative_count IS 'Atomically increment creative_count for a package';
COMMENT ON FUNCTION decrement_creative_count IS 'Atomically decrement creative_count (min 0)';
COMMENT ON FUNCTION set_creative_count IS 'Set creative_count to specific value (for sync operations)';
