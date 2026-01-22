-- Update package_ai_creatives table for dual format structure (1080x1080 + 1920x1080)

-- Add concepto column
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS concepto TEXT;

-- Add formato_1080 columns
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS titulo_principal_1080 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS subtitulo_1080 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS precio_texto_1080 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS cta_1080 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS descripcion_imagen_1080 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS estilo_1080 TEXT;

-- Add formato_1920 columns
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS titulo_principal_1920 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS subtitulo_1920 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS precio_texto_1920 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS cta_1920 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS descripcion_imagen_1920 TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS estilo_1920 TEXT;

-- Add new image columns for 1080 and 1920 formats
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS image_1080_file_id TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS image_1080_url TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS image_1920_file_id TEXT;
ALTER TABLE package_ai_creatives ADD COLUMN IF NOT EXISTS image_1920_url TEXT;

-- Migrate old data to new format (if old columns exist)
-- Copy old single-format data to 1080 format columns
UPDATE package_ai_creatives
SET
  titulo_principal_1080 = titulo_principal,
  subtitulo_1080 = subtitulo,
  precio_texto_1080 = precio_texto,
  cta_1080 = cta,
  descripcion_imagen_1080 = descripcion_imagen,
  estilo_1080 = estilo,
  titulo_principal_1920 = titulo_principal,
  subtitulo_1920 = subtitulo,
  precio_texto_1920 = precio_texto,
  cta_1920 = cta,
  descripcion_imagen_1920 = descripcion_imagen,
  estilo_1920 = estilo,
  image_1080_file_id = image_4x5_file_id,
  image_1080_url = image_4x5_url,
  image_1920_file_id = image_9x16_file_id,
  image_1920_url = image_9x16_url
WHERE titulo_principal_1080 IS NULL
  AND titulo_principal IS NOT NULL;

-- Add comment explaining the structure
COMMENT ON TABLE package_ai_creatives IS 'AI-generated creative content for packages. Each variant has two formats: 1080x1080 (1:1 for Feed) and 1920x1080 (16:9 for Stories/Reels)';
