-- Add SEO fields to packages table
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_description TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_keywords TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS meta_title TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS image_alt TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS include_sitemap BOOLEAN DEFAULT true;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_generated_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS seo_status TEXT DEFAULT 'pending'; -- pending, generated, uploaded

-- Create SEO prompt configuration table
CREATE TABLE IF NOT EXISTS seo_prompt_config (
  id SERIAL PRIMARY KEY,
  prompt_template TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default prompt template
INSERT INTO seo_prompt_config (prompt_template) VALUES (
'Eres un experto en SEO para agencias de viajes. Genera contenido SEO optimizado para el siguiente paquete turístico.

INFORMACIÓN DEL PAQUETE:
- Título: {title}
- Título largo: {large_title}
- Destinos: {destinations}
- Precio: {price} {currency} por persona
- Noches: {nights}
- Adultos: {adults}
- Fecha de salida: {departure_date}
- Aerolínea: {airline}
- Hoteles: {hotels_count}
- Transfers: {transfers_count}
- Temas: {themes}

Genera un JSON con los siguientes campos (respeta los límites de caracteres):
{
  "seo_title": "Título SEO atractivo (máximo 60 caracteres)",
  "seo_description": "Descripción SEO persuasiva (máximo 160 caracteres)",
  "seo_keywords": "Palabras clave separadas por coma (5-8 keywords relevantes)",
  "meta_title": "Meta título para Google (máximo 60 caracteres)",
  "meta_description": "Meta descripción para Google (máximo 155 caracteres)",
  "image_alt": "Texto alt para imagen principal (4-8 palabras descriptivas)"
}

Responde SOLO con el JSON, sin explicaciones adicionales.'
) ON CONFLICT DO NOTHING;

-- Create index for SEO status filtering
CREATE INDEX IF NOT EXISTS idx_packages_seo_status ON packages(seo_status);
CREATE INDEX IF NOT EXISTS idx_packages_include_sitemap ON packages(include_sitemap);
