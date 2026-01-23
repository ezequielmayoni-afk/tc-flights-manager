-- Migration: Add ai_brand_assets table
-- Purpose: Store brand assets for AI creative generation (manual, logo, style guide)

CREATE TABLE IF NOT EXISTS ai_brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value TEXT NOT NULL,
  content_type TEXT, -- 'text/markdown', 'image/png', 'application/json', etc.
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for fast key lookup
CREATE INDEX IF NOT EXISTS idx_ai_brand_assets_key ON ai_brand_assets(key);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_brand_assets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_brand_assets_updated_at
  BEFORE UPDATE ON ai_brand_assets
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_brand_assets_updated_at();

-- Insert initial empty records for required assets
INSERT INTO ai_brand_assets (key, value, content_type, description) VALUES
('manual_marca', '', 'text/markdown', 'Manual de marca Sí, Viajo - Identidad, personalidad, colores, tipografía'),
('logo_base64', '', 'image/png', 'Logo principal de Sí, Viajo en formato base64 para enviar a Gemini'),
('analisis_estilo', '', 'text/markdown', 'Análisis de estilo visual Nano Banana - Composición, paleta, elementos')
ON CONFLICT (key) DO NOTHING;

-- Add RLS policies
ALTER TABLE ai_brand_assets ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users
CREATE POLICY "ai_brand_assets_read_policy" ON ai_brand_assets
  FOR SELECT TO authenticated USING (true);

-- Allow insert/update/delete for admin users only
CREATE POLICY "ai_brand_assets_write_policy" ON ai_brand_assets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'superadmin')
    )
  );

COMMENT ON TABLE ai_brand_assets IS 'Stores brand assets for AI creative generation - editable from UI';
COMMENT ON COLUMN ai_brand_assets.key IS 'Unique identifier: manual_marca, logo_base64, analisis_estilo';
COMMENT ON COLUMN ai_brand_assets.value IS 'Content of the asset (markdown text or base64 encoded image)';
COMMENT ON COLUMN ai_brand_assets.content_type IS 'MIME type: text/markdown, image/png, etc.';
