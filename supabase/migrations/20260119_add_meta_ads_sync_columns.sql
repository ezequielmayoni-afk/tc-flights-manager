-- Add sync-related columns to meta_ads table
-- These columns track the real status from Meta API

ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS meta_status VARCHAR(30),
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

-- Add index for efficient queries on sync status
CREATE INDEX IF NOT EXISTS idx_meta_ads_last_synced ON meta_ads(last_synced_at);

COMMENT ON COLUMN meta_ads.meta_status IS 'Effective status from Meta API (ACTIVE, PAUSED, DELETED, etc.)';
COMMENT ON COLUMN meta_ads.last_synced_at IS 'Last time this ad was synced with Meta API';
