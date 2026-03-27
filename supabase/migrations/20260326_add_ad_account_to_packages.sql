-- Add ad_account_id to packages for multi-account support
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS meta_ad_account_id VARCHAR(50);

COMMENT ON COLUMN packages.meta_ad_account_id IS 'Meta Ad Account ID (e.g. act_123456) - overrides default account for this package';
