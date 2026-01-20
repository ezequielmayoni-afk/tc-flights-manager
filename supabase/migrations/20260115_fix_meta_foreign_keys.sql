-- ============================================
-- FIX: Add foreign key relationships for PostgREST nested queries
-- ============================================

-- Step 1: Clean up orphan adsets (adsets referencing non-existent campaigns)
DELETE FROM meta_adsets
WHERE meta_campaign_id NOT IN (SELECT meta_campaign_id FROM meta_campaigns);

-- Step 2: Clean up orphan ads_lookup records
DELETE FROM meta_ads_lookup
WHERE meta_campaign_id IS NOT NULL
  AND meta_campaign_id NOT IN (SELECT meta_campaign_id FROM meta_campaigns);

DELETE FROM meta_ads_lookup
WHERE meta_adset_id IS NOT NULL
  AND meta_adset_id NOT IN (SELECT meta_adset_id FROM meta_adsets);

-- Step 3: Add FK from meta_adsets to meta_campaigns
-- This enables Supabase nested queries like: meta_campaigns.select('*, meta_adsets(*)')
ALTER TABLE meta_adsets
  DROP CONSTRAINT IF EXISTS fk_meta_adsets_campaign;

ALTER TABLE meta_adsets
  ADD CONSTRAINT fk_meta_adsets_campaign
  FOREIGN KEY (meta_campaign_id)
  REFERENCES meta_campaigns(meta_campaign_id)
  ON DELETE CASCADE;

-- Step 4: Add FK from meta_ads_lookup to meta_adsets (optional, SET NULL on delete)
ALTER TABLE meta_ads_lookup
  DROP CONSTRAINT IF EXISTS fk_meta_ads_lookup_adset;

ALTER TABLE meta_ads_lookup
  ADD CONSTRAINT fk_meta_ads_lookup_adset
  FOREIGN KEY (meta_adset_id)
  REFERENCES meta_adsets(meta_adset_id)
  ON DELETE SET NULL;

-- Step 5: Add FK from meta_ads_lookup to meta_campaigns (optional, SET NULL on delete)
ALTER TABLE meta_ads_lookup
  DROP CONSTRAINT IF EXISTS fk_meta_ads_lookup_campaign;

ALTER TABLE meta_ads_lookup
  ADD CONSTRAINT fk_meta_ads_lookup_campaign
  FOREIGN KEY (meta_campaign_id)
  REFERENCES meta_campaigns(meta_campaign_id)
  ON DELETE SET NULL;

-- Refresh the schema cache (PostgREST will pick this up automatically)
NOTIFY pgrst, 'reload schema';
