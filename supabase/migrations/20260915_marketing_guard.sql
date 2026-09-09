-- ============================================================================
-- Fase 2 — Guard de marketing, decisiones sobre anuncios, vínculos cupo↔paquete,
-- salidas múltiples (grupos + redirección del SIV) y umbrales.
-- Todo IF NOT EXISTS: se puede aplicar más de una vez.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Decisiones sobre anuncios: cada "pausaría / pausé / pedí creatividad" queda
-- registrado con sus insumos, el modo en que se tomó y si se aplicó o deshizo.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ad_decisions (
  id BIGSERIAL PRIMARY KEY,
  meta_ad_id TEXT NOT NULL,
  meta_ads_row_id INTEGER REFERENCES meta_ads(id) ON DELETE SET NULL,
  package_id INTEGER REFERENCES packages(id) ON DELETE SET NULL,
  tc_package_id INTEGER,
  rule TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('pause', 'activate', 'request_creative', 'alert', 'redirect', 'hide_in_tc')),
  mode TEXT NOT NULL CHECK (mode IN ('shadow', 'semi', 'auto')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'applied', 'rejected', 'failed', 'expired', 'reverted')),
  reason TEXT NOT NULL,
  inputs JSONB NOT NULL DEFAULT '{}',
  dedupe_key TEXT,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '7 days',
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  applied_result JSONB,
  reverted_by TEXT,
  reverted_at TIMESTAMPTZ,
  job_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_ad_decisions_open
  ON ad_decisions (dedupe_key) WHERE dedupe_key IS NOT NULL AND status IN ('proposed', 'approved');
CREATE INDEX IF NOT EXISTS idx_ad_decisions_status ON ad_decisions (status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_decisions_ad ON ad_decisions (meta_ad_id);
CREATE INDEX IF NOT EXISTS idx_ad_decisions_package ON ad_decisions (package_id);

COMMENT ON TABLE ad_decisions IS
  'Decisiones del guard/autopilot sobre anuncios de Meta: propuesta → aprobada → aplicada, con deshacer. rule = expired | not_visible | tc_inactive | sold_out | price_drift | underperforming | manual';

-- ----------------------------------------------------------------------------
-- Vínculo cupo ↔ paquete persistido. El matcheo automático lo refresca cada
-- día; un humano lo confirma. Sólo un vínculo confirmado o de confianza alta
-- autoriza a pausar anuncios u ocultar en TC sin humano.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_package_links (
  id BIGSERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  confidence TEXT NOT NULL CHECK (confidence IN ('alta', 'media', 'baja')),
  source TEXT NOT NULL CHECK (source IN ('auto_match', 'cupo_request', 'manual')),
  confirmed BOOLEAN NOT NULL DEFAULT false,
  confirmed_by TEXT,
  confirmed_at TIMESTAMPTZ,
  rejected BOOLEAN NOT NULL DEFAULT false,
  match_criteria JSONB NOT NULL DEFAULT '{}',
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (flight_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_fpl_package ON flight_package_links (package_id);
CREATE INDEX IF NOT EXISTS idx_fpl_flight ON flight_package_links (flight_id);

-- ----------------------------------------------------------------------------
-- Salidas múltiples: un producto con varias fechas son varios paquetes con
-- distinto tc_package_id. En Meta se publica uno; cuando se agota, el SIV
-- del mensaje de WhatsApp se redirige a la siguiente salida con lugares.
-- /api/bot/packages (lo que consulta el bot del CRM) resuelve la redirección.
-- ----------------------------------------------------------------------------
ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS departure_group_id TEXT,
  ADD COLUMN IF NOT EXISTS departure_index INTEGER,
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS tc_visible BOOLEAN,
  ADD COLUMN IF NOT EXISTS tc_state_mismatch BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tc_state_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS write_lock_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS insights_fresh_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_packages_departure_group ON packages (departure_group_id) WHERE departure_group_id IS NOT NULL;

COMMENT ON COLUMN packages.departure_group_id IS 'Mismo producto, distintas fechas: los paquetes del grupo se turnan en el mismo anuncio de Meta (siv_redirects).';

CREATE TABLE IF NOT EXISTS siv_redirects (
  id BIGSERIAL PRIMARY KEY,
  from_tc_package_id INTEGER NOT NULL,
  to_tc_package_id INTEGER NOT NULL,
  reason TEXT NOT NULL CHECK (reason IN ('sold_out', 'expired', 'manual')),
  active BOOLEAN NOT NULL DEFAULT true,
  active_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_until TIMESTAMPTZ,
  note TEXT,
  created_by TEXT,
  ad_decision_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_siv_redirects_active ON siv_redirects (from_tc_package_id) WHERE active;

COMMENT ON TABLE siv_redirects IS
  'Cuando el tc_package_id publicado en un anuncio se agota, el bot del CRM recibe la siguiente salida del grupo. No se toca Meta.';

-- ----------------------------------------------------------------------------
-- Anuncios: quién los pausó y por qué; si el guard puede manejarlos.
-- ----------------------------------------------------------------------------
ALTER TABLE meta_ads
  ADD COLUMN IF NOT EXISTS paused_reason TEXT,
  ADD COLUMN IF NOT EXISTS paused_by TEXT,
  ADD COLUMN IF NOT EXISTS paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_managed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS launched_by TEXT;

COMMENT ON COLUMN meta_ads.auto_managed IS 'false = el guard y el autopilot no lo tocan (lo maneja una persona).';

-- ----------------------------------------------------------------------------
-- Pedidos de creatividad disparados por el sistema, con clave para no duplicar.
-- reason suma: sold_out_departure | price_change | fatigue | scarcity | new_departure
-- ----------------------------------------------------------------------------
ALTER TABLE creative_requests
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS trigger_key TEXT,
  ADD COLUMN IF NOT EXISTS ad_decision_id BIGINT,
  ADD COLUMN IF NOT EXISTS idea_id BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_creative_requests_trigger
  ON creative_requests (trigger_key) WHERE trigger_key IS NOT NULL AND status IN ('pending', 'in_progress');

-- ----------------------------------------------------------------------------
-- Umbrales y canales del loop. price_change_threshold_pct (ya existía) pasa a
-- ser EL umbral: el cron usaba 5 % y el import 10 %, ambos hardcodeados.
-- ----------------------------------------------------------------------------
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS slack_channel_automation TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_producto TEXT,
  ADD COLUMN IF NOT EXISTS slack_channel_aereos TEXT,
  ADD COLUMN IF NOT EXISTS auto_hide_in_tc_on_sold_out BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS insights_sync_preset TEXT NOT NULL DEFAULT 'hourly',
  ADD COLUMN IF NOT EXISTS cupo_request_sla_hours INTEGER NOT NULL DEFAULT 72,
  ADD COLUMN IF NOT EXISTS requote_accept_tolerance_pct NUMERIC NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS guard_min_days_before_departure INTEGER NOT NULL DEFAULT 0;

-- ----------------------------------------------------------------------------
-- RLS: lectura para usuarios logueados, escritura sólo service role.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['ad_decisions', 'flight_package_links', 'siv_redirects'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users can view ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'Authenticated users can view ' || t, t);
    END IF;
  END LOOP;
END $$;
