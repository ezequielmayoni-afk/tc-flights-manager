-- Fase 5: familias de destino → campaña y conjunto plantilla en Meta. 2026-10-14. Idempotente.

CREATE TABLE IF NOT EXISTS marketing_families (
  key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  meta_campaign_id TEXT,
  template_adset_id TEXT,
  -- null = el presupuesto queda como en la plantilla (o en la campaña, si es CBO)
  daily_budget_cents INTEGER,
  target_cpcon_usd NUMERIC,
  target_cpa_usd NUMERIC,
  max_active_ads_per_adset INTEGER NOT NULL DEFAULT 4,
  -- true: al completarse diseño, HUB lanza solo (siempre en pausa). false: botón "Lanzar en Meta".
  auto_launch BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
ALTER TABLE marketing_families ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_families_read ON marketing_families;
CREATE POLICY marketing_families_read ON marketing_families FOR SELECT TO authenticated USING (true);

-- Semilla con las campañas que HUB ya usa (meta_campaigns/meta_adsets al 2026-10-14). Editable en /packages/marketing/familias.
INSERT INTO marketing_families (key, name, meta_campaign_id, template_adset_id, sort_order, notes) VALUES
  ('caribe', 'Caribe', '52595058849732', '52629487775732', 1, 'CBO_CARIBE VENTAS - Copia · presupuesto en la campaña; plantilla JAMAICA_59817023'),
  ('brasil', 'Brasil', '52598973024732', '52629493101732', 2, 'CBO_BRASIL VENTAS - Copia · presupuesto en la campaña; plantilla pipa y natal_48534889'),
  ('europa_exoticos', 'Europa y exóticos (grupales)', '6660868221928', '52633822793132', 3, 'ABO_EUROPA_Y_EXOTICOS_GRUPALES_2026_ok · presupuesto por conjunto; plantilla EUROPA_MAGICA_17_APRIL_59599262'),
  ('eventos', 'Eventos deportivos (F1, rugby)', '6951885401728', '52629696507332', 4, 'ABO_SPORTS · plantilla ITERLAGOS CHARTER_39636714'),
  ('usa', 'Estados Unidos', NULL, NULL, 5, 'Sin campaña propia todavía: cargar campaña y conjunto plantilla para poder lanzar'),
  ('argentina', 'Argentina', NULL, NULL, 6, 'Sin campaña: por lo general no va a pauta')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_family TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS meta_launch_campaign_id TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS meta_launch_adset_id TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS launched_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_activated_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS launch_error TEXT;
COMMENT ON COLUMN packages.marketing_family IS 'Override manual de la familia (caribe, brasil, europa_exoticos, eventos, usa, argentina). Null = se deduce del perfil del destino.';
COMMENT ON COLUMN packages.marketing_status IS 'pending | copy_generated | launching | launched (conjunto y anuncios en pausa, falta activar) | active | paused | ended';

ALTER TABLE meta_ad_copies ADD COLUMN IF NOT EXISTS angle TEXT;
ALTER TABLE meta_ad_copies ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE meta_ad_copies ADD COLUMN IF NOT EXISTS qa_issues JSONB;
