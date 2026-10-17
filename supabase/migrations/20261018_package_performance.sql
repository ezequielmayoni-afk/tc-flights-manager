-- Fase 8: tablero paquete × CRM. Rollup nocturno de sólo lectura del CRM persistido en HUB. 2026-10-17. Idempotente.

CREATE TABLE IF NOT EXISTS crm_contact_attributions (
  contact_id UUID NOT NULL,
  tc_package_id INTEGER NOT NULL,          -- 0 = contacto con anuncio pero sin código SIV
  siv_first_at TIMESTAMPTZ,
  siv_messages INTEGER NOT NULL DEFAULT 0,
  ad_id TEXT,
  ad_name TEXT,
  adset_name TEXT,
  campaign_name TEXT,
  ad_title TEXT,
  ctwa_click_id TEXT,
  click_at TIMESTAMPTZ,
  is_first_touch BOOLEAN,
  attribution_confidence TEXT NOT NULL DEFAULT 'siv' CHECK (attribution_confidence IN ('siv','adid','both','none')),
  assigned_user_id UUID,
  assigned_user_name TEXT,
  assigned_team_id UUID,
  assigned_team_name TEXT,
  contact_created_at TIMESTAMPTZ,
  opportunity_id UUID,
  opportunity_stage TEXT,
  opportunity_status TEXT,
  opportunity_created_at TIMESTAMPTZ,
  won BOOLEAN NOT NULL DEFAULT false,
  lost BOOLEAN NOT NULL DEFAULT false,
  closed_reason TEXT,
  closed_at TIMESTAMPTZ,
  quoted_value NUMERIC,
  final_value NUMERIC,
  profit NUMERIC,
  currency TEXT,
  quotations_count INTEGER NOT NULL DEFAULT 0,
  capi_events TEXT[] NOT NULL DEFAULT '{}',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contact_id, tc_package_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_attr_package_date ON crm_contact_attributions (tc_package_id, siv_first_at);
CREATE INDEX IF NOT EXISTS idx_crm_attr_user ON crm_contact_attributions (assigned_user_id);

CREATE TABLE IF NOT EXISTS package_performance_daily (
  date DATE NOT NULL,
  tc_package_id INTEGER NOT NULL,
  ad_id TEXT NOT NULL DEFAULT '*',
  assigned_user_id TEXT NOT NULL DEFAULT '*',
  assigned_team_id TEXT NOT NULL DEFAULT '*',
  spend NUMERIC NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  conversations_started INTEGER NOT NULL DEFAULT 0,
  messages_in INTEGER NOT NULL DEFAULT 0,
  contacts_new INTEGER NOT NULL DEFAULT 0,
  opportunities_created INTEGER NOT NULL DEFAULT 0,
  quotations_sent INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  lost INTEGER NOT NULL DEFAULT 0,
  view_content INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  initiate_checkout INTEGER NOT NULL DEFAULT 0,
  purchase INTEGER NOT NULL DEFAULT 0,
  revenue_won NUMERIC NOT NULL DEFAULT 0,
  profit_won NUMERIC NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (date, tc_package_id, ad_id, assigned_user_id, assigned_team_id)
);
CREATE INDEX IF NOT EXISTS idx_ppd_package ON package_performance_daily (tc_package_id, date);

CREATE TABLE IF NOT EXISTS crm_rollup_watermarks (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE crm_contact_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_performance_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_rollup_watermarks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS crm_contact_attributions_read ON crm_contact_attributions;
CREATE POLICY crm_contact_attributions_read ON crm_contact_attributions FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS package_performance_daily_read ON package_performance_daily;
CREATE POLICY package_performance_daily_read ON package_performance_daily FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS crm_rollup_watermarks_read ON crm_rollup_watermarks;
CREATE POLICY crm_rollup_watermarks_read ON crm_rollup_watermarks FOR SELECT TO authenticated USING (true);
