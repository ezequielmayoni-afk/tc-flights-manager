-- Migration: Add monitoring and requote fields to packages
-- Description: Track packages for automated price monitoring via Playwright

-- Add requote_status enum type
DO $$ BEGIN
  CREATE TYPE requote_status AS ENUM ('pending', 'checking', 'needs_manual', 'completed');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Add monitoring fields to packages table
ALTER TABLE packages ADD COLUMN IF NOT EXISTS monitor_enabled BOOLEAN DEFAULT false;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS target_price DECIMAL(12,2);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requote_status requote_status;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS last_requote_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requote_price DECIMAL(12,2);
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requote_variance_pct DECIMAL(5,2);

-- Create indexes for filtering
CREATE INDEX IF NOT EXISTS idx_packages_monitor_enabled ON packages(monitor_enabled) WHERE monitor_enabled = true;
CREATE INDEX IF NOT EXISTS idx_packages_requote_status ON packages(requote_status) WHERE requote_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_packages_needs_manual ON packages(requote_status) WHERE requote_status = 'needs_manual';

-- Comments
COMMENT ON COLUMN packages.monitor_enabled IS 'Whether this package is enabled for automated price monitoring';
COMMENT ON COLUMN packages.target_price IS 'Target price per person for this package (optional, for comparison)';
COMMENT ON COLUMN packages.requote_status IS 'Status of the automated requote process: pending, checking, needs_manual, completed';
COMMENT ON COLUMN packages.last_requote_at IS 'Timestamp of the last automated requote check';
COMMENT ON COLUMN packages.requote_price IS 'Latest price found during automated requote check';
COMMENT ON COLUMN packages.requote_variance_pct IS 'Percentage variance between current price and requote price';

-- Create table for requote history/logs
CREATE TABLE IF NOT EXISTS package_requote_logs (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  checked_at TIMESTAMPTZ DEFAULT NOW(),
  previous_price DECIMAL(12,2),
  new_price DECIMAL(12,2),
  variance_pct DECIMAL(5,2),
  action_taken VARCHAR(50), -- 'auto_updated', 'marked_manual', 'no_change', 'error'
  error_message TEXT,
  screenshot_url TEXT
);

CREATE INDEX IF NOT EXISTS idx_requote_logs_package ON package_requote_logs(package_id);
CREATE INDEX IF NOT EXISTS idx_requote_logs_checked_at ON package_requote_logs(checked_at DESC);
