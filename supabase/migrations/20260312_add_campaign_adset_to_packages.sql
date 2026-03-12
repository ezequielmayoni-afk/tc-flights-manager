-- Add campaign_id and adset_ids to packages for persistence
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS meta_campaign_id VARCHAR(50),
  ADD COLUMN IF NOT EXISTS meta_adset_ids TEXT;

COMMENT ON COLUMN packages.meta_campaign_id IS 'Meta Campaign ID linked to this package';
COMMENT ON COLUMN packages.meta_adset_ids IS 'Comma-separated Meta AdSet IDs linked to this package';
