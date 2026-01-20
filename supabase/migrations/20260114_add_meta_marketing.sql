-- Meta Marketing Integration Tables
-- This migration adds tables for Meta (Facebook/Instagram) ads integration

-- ============================================
-- META CAMPAIGNS (synced from Meta Business Manager)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id SERIAL PRIMARY KEY,
  meta_campaign_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  objective VARCHAR(50),
  daily_budget DECIMAL(12,2),
  lifetime_budget DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'USD',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_campaigns_status ON meta_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_meta_campaigns_sync ON meta_campaigns(last_sync_at);

-- ============================================
-- META AD SETS (synced from Meta Business Manager)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_adsets (
  id SERIAL PRIMARY KEY,
  meta_adset_id VARCHAR(50) UNIQUE NOT NULL,
  meta_campaign_id VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'ACTIVE',
  targeting JSONB,
  daily_budget DECIMAL(12,2),
  bid_amount DECIMAL(12,2),
  optimization_goal VARCHAR(50),
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_adsets_campaign ON meta_adsets(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_adsets_status ON meta_adsets(status);

-- ============================================
-- META CREATIVES (uploaded from Google Drive to Meta)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_creatives (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL,
  tc_package_id INTEGER NOT NULL,
  variant INTEGER NOT NULL CHECK (variant BETWEEN 1 AND 5),
  aspect_ratio VARCHAR(4) NOT NULL CHECK (aspect_ratio IN ('4x5', '9x16')),

  -- Google Drive source
  drive_file_id VARCHAR(100) NOT NULL,
  drive_url VARCHAR(500),

  -- Meta creative info
  meta_image_hash VARCHAR(100),
  meta_video_id VARCHAR(50),
  creative_type VARCHAR(10) NOT NULL CHECK (creative_type IN ('IMAGE', 'VIDEO')),

  -- Status tracking
  upload_status VARCHAR(20) DEFAULT 'pending' CHECK (upload_status IN ('pending', 'uploading', 'uploaded', 'error')),
  upload_error TEXT,
  uploaded_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(package_id, variant, aspect_ratio)
);

CREATE INDEX IF NOT EXISTS idx_meta_creatives_package ON meta_creatives(package_id);
CREATE INDEX IF NOT EXISTS idx_meta_creatives_tc_package ON meta_creatives(tc_package_id);
CREATE INDEX IF NOT EXISTS idx_meta_creatives_status ON meta_creatives(upload_status);

-- ============================================
-- META AD COPIES (AI-generated copy variants)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_ad_copies (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL,
  tc_package_id INTEGER NOT NULL,
  variant INTEGER NOT NULL CHECK (variant BETWEEN 1 AND 5),

  -- Ad copy content
  headline VARCHAR(40) NOT NULL,
  primary_text TEXT NOT NULL,
  description VARCHAR(125),
  cta_type VARCHAR(30) DEFAULT 'SEND_MESSAGE',

  -- WhatsApp message template
  wa_message_template TEXT NOT NULL,

  -- Generation metadata
  generated_by VARCHAR(20) DEFAULT 'ai' CHECK (generated_by IN ('ai', 'manual')),

  -- Approval workflow
  approved BOOLEAN DEFAULT FALSE,
  approved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(package_id, variant)
);

CREATE INDEX IF NOT EXISTS idx_meta_copies_package ON meta_ad_copies(package_id);
CREATE INDEX IF NOT EXISTS idx_meta_copies_tc_package ON meta_ad_copies(tc_package_id);
CREATE INDEX IF NOT EXISTS idx_meta_copies_approved ON meta_ad_copies(approved);

-- ============================================
-- META ADS (created ads in Meta)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_ads (
  id SERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL,
  tc_package_id INTEGER NOT NULL,
  variant INTEGER NOT NULL CHECK (variant BETWEEN 1 AND 5),

  -- Meta references
  meta_ad_id VARCHAR(50) UNIQUE,
  meta_adset_id VARCHAR(50) NOT NULL,
  meta_creative_id VARCHAR(50),

  -- Ad info
  ad_name VARCHAR(255) NOT NULL,
  status VARCHAR(30) DEFAULT 'PENDING_REVIEW',

  -- Related records
  copy_id INTEGER REFERENCES meta_ad_copies(id),
  creative_id INTEGER REFERENCES meta_creatives(id),

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,

  UNIQUE(package_id, variant, meta_adset_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_package ON meta_ads(package_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_tc_package ON meta_ads(tc_package_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_adset ON meta_ads(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_status ON meta_ads(status);
CREATE INDEX IF NOT EXISTS idx_meta_ads_meta_id ON meta_ads(meta_ad_id);

-- ============================================
-- META AD INSIGHTS (performance metrics)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_ad_insights (
  id SERIAL PRIMARY KEY,
  meta_ad_id VARCHAR(50) NOT NULL,
  date_start DATE NOT NULL,
  date_stop DATE NOT NULL,

  -- Engagement metrics
  impressions INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  link_clicks INTEGER DEFAULT 0,

  -- Conversion metrics
  leads INTEGER DEFAULT 0,
  messages INTEGER DEFAULT 0,
  messaging_first_reply INTEGER DEFAULT 0,

  -- Cost metrics
  spend DECIMAL(12,2) DEFAULT 0,
  cpm DECIMAL(12,4),
  cpc DECIMAL(12,4),
  cpl DECIMAL(12,4),

  -- Calculated metrics
  ctr DECIMAL(8,4),
  conversion_rate DECIMAL(8,4),

  synced_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(meta_ad_id, date_start, date_stop)
);

CREATE INDEX IF NOT EXISTS idx_meta_insights_ad ON meta_ad_insights(meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_meta_insights_dates ON meta_ad_insights(date_start, date_stop);

-- ============================================
-- META COPY PROMPT CONFIG (AI prompt template)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_copy_prompt_config (
  id SERIAL PRIMARY KEY,
  prompt_template TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default prompt template
INSERT INTO meta_copy_prompt_config (prompt_template, is_active) VALUES (
'Eres un experto en marketing digital para agencias de viajes en Argentina.

Genera 5 variantes de copy para un anuncio de Meta (Facebook/Instagram) para el siguiente paquete:

**Paquete:** {title}
**Destinos:** {destinations}
**Noches:** {nights}
**Precio:** {price} {currency} por persona
**Fecha de salida:** {departure_date}
**Hotel:** {hotel_name}
**Incluye:** {includes}
**Aerolínea:** {airline}

Cada variante debe tener:
1. **headline**: Máximo 40 caracteres. Gancho emocional o beneficio principal.
2. **primary_text**: Texto principal del anuncio (máximo 125 palabras). Debe generar urgencia y deseo.
3. **description**: Máximo 125 caracteres. Call-to-action o beneficio secundario.
4. **wa_message_template**: Mensaje predefinido para WhatsApp con el formato exacto:
   "Hola! Me interesa la promo\n.\nPreguntas y respuestas\n1. ¡Hola! Quiero más info de la promo SIV {tc_package_id} (no borrar)"

Variaciones a crear:
- Variante 1: Enfoque en PRECIO/OFERTA (urgencia por precio bajo)
- Variante 2: Enfoque en EXPERIENCIA (emocional, soñar con el destino)
- Variante 3: Enfoque en DESTINO (características únicas del lugar)
- Variante 4: Enfoque en CONVENIENCIA (todo incluido, sin preocupaciones)
- Variante 5: Enfoque en ESCASEZ (últimos lugares, cupos limitados)

Responde SOLO con un JSON válido con este formato:
{
  "variants": [
    {
      "variant": 1,
      "headline": "...",
      "primary_text": "...",
      "description": "...",
      "wa_message_template": "..."
    }
  ]
}

Usa emojis estratégicamente. El tono debe ser amigable pero profesional.
El idioma es español argentino.',
true
);

-- ============================================
-- META AI RECOMMENDATIONS (performance analysis)
-- ============================================
CREATE TABLE IF NOT EXISTS meta_ai_recommendations (
  id SERIAL PRIMARY KEY,
  analysis_date DATE NOT NULL,
  analysis_type VARCHAR(30) NOT NULL CHECK (analysis_type IN ('daily', 'weekly', 'campaign', 'package', 'global')),
  reference_id VARCHAR(50),

  -- AI analysis results
  summary TEXT NOT NULL,
  recommendations JSONB NOT NULL,
  metrics_analyzed JSONB NOT NULL,

  -- Model info
  model_used VARCHAR(50) DEFAULT 'gpt-4o-mini',

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_recommendations_date ON meta_ai_recommendations(analysis_date);
CREATE INDEX IF NOT EXISTS idx_meta_recommendations_type ON meta_ai_recommendations(analysis_type);

-- ============================================
-- UPDATE PACKAGES TABLE (add marketing fields)
-- ============================================
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_status VARCHAR(20) DEFAULT 'pending';
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_started_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS ads_created_count INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS ads_active_count INTEGER DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS total_ad_spend DECIMAL(12,2) DEFAULT 0;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS total_leads INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_packages_marketing_status ON packages(marketing_status);

-- Add comment for documentation
COMMENT ON TABLE meta_campaigns IS 'Cached campaigns from Meta Business Manager for dropdown selection';
COMMENT ON TABLE meta_adsets IS 'Cached ad sets from Meta Business Manager for dropdown selection';
COMMENT ON TABLE meta_creatives IS 'Creative assets uploaded from Google Drive to Meta';
COMMENT ON TABLE meta_ad_copies IS 'AI-generated ad copy variants (5 per package)';
COMMENT ON TABLE meta_ads IS 'Ads created in Meta Ads Manager';
COMMENT ON TABLE meta_ad_insights IS 'Performance metrics synced from Meta';
COMMENT ON TABLE meta_copy_prompt_config IS 'AI prompt template for generating ad copy';
COMMENT ON TABLE meta_ai_recommendations IS 'AI-generated performance recommendations';
