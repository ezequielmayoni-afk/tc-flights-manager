-- ============================================================================
-- Fase 1 — Tendencias dentro de HUB
--
-- Las tablas trend_runs / trend_destinations / trend_alerts ya existen en
-- producción (las creó media-os; RLS activada en la Fase 0). Acá se les suma
-- lo que necesita HUB y se crea la tabla de señales macro semanales.
-- Todo es IF NOT EXISTS: se puede aplicar más de una vez.
-- ============================================================================

-- La migración 009 de media-os nunca llegó a producción.
ALTER TABLE trend_destinations
  ADD COLUMN IF NOT EXISTS related_queries JSONB NOT NULL DEFAULT '[]';

COMMENT ON COLUMN trend_destinations.related_queries IS
  'Consultas relacionadas de Google Trends: [{query, value, intent}] con intent = buy|info|brand|other';

-- Vínculo de cada corrida con el job que la ejecutó.
ALTER TABLE trend_runs
  ADD COLUMN IF NOT EXISTS job_id BIGINT;

-- Una alerta se cierra creando una idea (Fase 3) o descartándola.
ALTER TABLE trend_alerts
  ADD COLUMN IF NOT EXISTS idea_id BIGINT,
  ADD COLUMN IF NOT EXISTS action_taken TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_by TEXT,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'trend_alerts_action_taken_check'
  ) THEN
    ALTER TABLE trend_alerts
      ADD CONSTRAINT trend_alerts_action_taken_check
      CHECK (action_taken IS NULL OR action_taken IN ('idea_created', 'dismissed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trend_alerts_open
  ON trend_alerts (created_at DESC)
  WHERE acknowledged = false;

-- ----------------------------------------------------------------------------
-- Señales de demanda semanales (macro y por destino)
--
-- Una fila por semana × destino × fuente. destination_code = '*' para señales
-- macro (tipo de cambio, feriados). value es el número que se grafica;
-- metadata guarda el detalle (serie, próximos feriados, top queries…).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS demand_signals_weekly (
  id BIGSERIAL PRIMARY KEY,
  week_label TEXT NOT NULL,
  destination_code TEXT NOT NULL DEFAULT '*',
  source TEXT NOT NULL CHECK (source IN ('crm_wa', 'bcra_fx', 'feriados', 'search_console', 'indec_eti', 'competitor_ads')),
  value NUMERIC,
  metadata JSONB NOT NULL DEFAULT '{}',
  job_id BIGINT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_label, destination_code, source)
);

CREATE INDEX IF NOT EXISTS idx_demand_signals_source_week
  ON demand_signals_weekly (source, week_label DESC);

ALTER TABLE demand_signals_weekly ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'demand_signals_weekly' AND policyname = 'Authenticated users can view demand_signals_weekly'
  ) THEN
    CREATE POLICY "Authenticated users can view demand_signals_weekly"
      ON demand_signals_weekly FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

COMMENT ON TABLE demand_signals_weekly IS
  'Señales semanales de demanda (Fase 1 del loop): bcra_fx y feriados son macro (destination_code=*); search_console y crm_wa van por destino.';
