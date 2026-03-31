-- Extend variant range from 1-5 to 1-20 for all marketing tables
-- This allows design to upload more than 5 creative variants

-- meta_ad_copies: stores AI-generated copy per variant
ALTER TABLE meta_ad_copies DROP CONSTRAINT IF EXISTS meta_ad_copies_variant_check;
ALTER TABLE meta_ad_copies ADD CONSTRAINT meta_ad_copies_variant_check CHECK (variant BETWEEN 1 AND 20);

-- meta_creatives: stores uploaded creative media per variant
ALTER TABLE meta_creatives DROP CONSTRAINT IF EXISTS meta_creatives_variant_check;
ALTER TABLE meta_creatives ADD CONSTRAINT meta_creatives_variant_check CHECK (variant BETWEEN 1 AND 20);

-- ai_generation_logs: logs of AI generation
ALTER TABLE ai_generation_logs DROP CONSTRAINT IF EXISTS ai_generation_logs_variant_check;
ALTER TABLE ai_generation_logs ADD CONSTRAINT ai_generation_logs_variant_check CHECK (variant >= 1 AND variant <= 20);
