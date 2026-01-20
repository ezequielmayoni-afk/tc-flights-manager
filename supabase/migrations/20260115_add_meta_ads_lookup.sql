-- Meta Ads Lookup Table
-- Stores metadata for all ads from the Meta account (for display in insights)
-- This is separate from meta_ads which requires package_id

CREATE TABLE IF NOT EXISTS meta_ads_lookup (
  id SERIAL PRIMARY KEY,
  meta_ad_id VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(500) NOT NULL,
  status VARCHAR(30),
  meta_adset_id VARCHAR(50),
  meta_campaign_id VARCHAR(50),
  created_time TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meta_ads_lookup_ad_id ON meta_ads_lookup(meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_lookup_campaign ON meta_ads_lookup(meta_campaign_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_lookup_adset ON meta_ads_lookup(meta_adset_id);
CREATE INDEX IF NOT EXISTS idx_meta_ads_lookup_status ON meta_ads_lookup(status);

COMMENT ON TABLE meta_ads_lookup IS 'Cached metadata for all ads in the Meta account, used for displaying ad names in insights';

-- Agregar campos adicionales a meta_ad_insights para análisis completo con IA
ALTER TABLE meta_ad_insights
  ADD COLUMN IF NOT EXISTS frequency DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unique_ctr DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS cost_per_unique_click DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS inline_link_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inline_link_click_ctr DECIMAL(10,4),
  ADD COLUMN IF NOT EXISTS outbound_clicks INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_outbound_click DECIMAL(12,4),
  -- Video metrics
  ADD COLUMN IF NOT EXISTS video_p25_watched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p50_watched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p75_watched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_p100_watched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_avg_time_watched INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS video_plays INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS thruplays INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_thruplay DECIMAL(12,4),
  -- Quality metrics
  ADD COLUMN IF NOT EXISTS quality_ranking VARCHAR(30),
  ADD COLUMN IF NOT EXISTS engagement_rate_ranking VARCHAR(30),
  ADD COLUMN IF NOT EXISTS conversion_rate_ranking VARCHAR(30),
  -- Conversion metrics
  ADD COLUMN IF NOT EXISTS conversions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conversion_values DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_conversion DECIMAL(12,4),
  ADD COLUMN IF NOT EXISTS purchase INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS purchase_value DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS add_to_cart INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS initiate_checkout INTEGER DEFAULT 0,
  -- Social metrics
  ADD COLUMN IF NOT EXISTS social_spend DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_engagement INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS page_engagement INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_reactions INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_comments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_saves INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_views INTEGER DEFAULT 0,
  -- Messaging metrics
  ADD COLUMN IF NOT EXISTS messaging_conversations_started INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS messaging_replies INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cost_per_messaging_reply DECIMAL(12,4),
  -- Result metrics
  ADD COLUMN IF NOT EXISTS results INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS result_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS cost_per_result DECIMAL(12,4),
  -- Raw data for AI analysis
  ADD COLUMN IF NOT EXISTS actions_raw JSONB,
  ADD COLUMN IF NOT EXISTS cost_per_action_raw JSONB;

COMMENT ON COLUMN meta_ad_insights.actions_raw IS 'Raw actions array from Meta API for complete AI analysis';
COMMENT ON COLUMN meta_ad_insights.cost_per_action_raw IS 'Raw cost_per_action_type array from Meta API';
