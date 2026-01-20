-- Add seo_uploaded_at column to track when SEO was uploaded to TravelCompositor
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_uploaded_at TIMESTAMPTZ;

-- Add boolean column to track if SEO is uploaded to TC (for manual control)
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_uploaded_to_tc BOOLEAN DEFAULT false;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_packages_seo_uploaded_at ON packages(seo_uploaded_at);
CREATE INDEX IF NOT EXISTS idx_packages_seo_uploaded_to_tc ON packages(seo_uploaded_to_tc);
