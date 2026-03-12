-- Add thumbnail_url to meta_ads for imported ads preview
ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

-- Relax variant constraint to allow more than 5 variants (for manual imports)
ALTER TABLE meta_ads DROP CONSTRAINT IF EXISTS meta_ads_variant_check;
ALTER TABLE meta_ads ADD CONSTRAINT meta_ads_variant_check CHECK (variant BETWEEN 1 AND 20);
