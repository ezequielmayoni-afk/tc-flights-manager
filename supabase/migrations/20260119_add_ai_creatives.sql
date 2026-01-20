-- Migration: Add AI-generated creatives table
-- Date: 2026-01-19
-- Description: Store AI-generated creative content for packages (Gemini + Imagen 3)

-- Create the package_ai_creatives table
CREATE TABLE IF NOT EXISTS package_ai_creatives (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  tc_package_id INTEGER NOT NULL,

  -- Variant info (1-5)
  variant INTEGER NOT NULL CHECK (variant >= 1 AND variant <= 5),

  -- Generated text content (from Gemini)
  titulo_principal TEXT NOT NULL,
  subtitulo TEXT NOT NULL,
  precio_texto TEXT NOT NULL,
  cta TEXT NOT NULL,
  descripcion_imagen TEXT NOT NULL, -- English prompt for Imagen 3
  estilo TEXT,

  -- Generated images (stored in Google Drive)
  image_4x5_file_id TEXT,
  image_4x5_url TEXT,
  image_9x16_file_id TEXT,
  image_9x16_url TEXT,

  -- Generation metadata
  model_used TEXT NOT NULL DEFAULT 'gemini-1.5-pro',
  imagen_model_used TEXT DEFAULT 'imagen-3.0-generate-001',
  prompt_version TEXT NOT NULL DEFAULT 'v2',
  generation_cost_tokens INTEGER,

  -- Metadata from generation
  destino TEXT,
  fecha_salida TEXT,
  precio_base DECIMAL(10, 2),
  currency TEXT,
  noches INTEGER,
  regimen TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure unique variant per package
  UNIQUE(package_id, variant)
);

-- Create indexes for common queries
CREATE INDEX idx_ai_creatives_package_id ON package_ai_creatives(package_id);
CREATE INDEX idx_ai_creatives_tc_package_id ON package_ai_creatives(tc_package_id);
CREATE INDEX idx_ai_creatives_created_at ON package_ai_creatives(created_at DESC);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_ai_creatives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ai_creatives_updated_at
  BEFORE UPDATE ON package_ai_creatives
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_creatives_updated_at();

-- Add comments for documentation
COMMENT ON TABLE package_ai_creatives IS 'AI-generated creative content for packages using Gemini and Imagen 3';
COMMENT ON COLUMN package_ai_creatives.variant IS 'Variant number (1-5), each with different creative approach';
COMMENT ON COLUMN package_ai_creatives.descripcion_imagen IS 'English prompt used to generate images with Imagen 3';
COMMENT ON COLUMN package_ai_creatives.image_4x5_file_id IS 'Google Drive file ID for 4:5 aspect ratio image';
COMMENT ON COLUMN package_ai_creatives.image_9x16_file_id IS 'Google Drive file ID for 9:16 aspect ratio image';
