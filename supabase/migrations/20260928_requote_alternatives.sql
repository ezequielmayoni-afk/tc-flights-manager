-- Fecha alternativa dentro de la misma temporada (cupo agotado → sistema). 2026-09-11. Idempotente.
CREATE TABLE IF NOT EXISTS requote_alternatives (
  id BIGSERIAL PRIMARY KEY,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
  quote_run_id BIGINT,
  trigger TEXT NOT NULL DEFAULT 'manual',           -- manual | cupo_sold_out | needs_manual
  season_kind TEXT,                                  -- alta | baja
  window_from DATE,
  window_to DATE,
  current_departure DATE,
  current_price_pp NUMERIC,
  proposed_departure DATE,
  proposed_return DATE,
  nights INTEGER,
  price_pp NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  variance_pct NUMERIC,
  airline TEXT,
  flight_numbers TEXT[] NOT NULL DEFAULT '{}',
  direct BOOLEAN,
  stops INTEGER,
  hotel_names TEXT[] NOT NULL DEFAULT '{}',
  hotel_matched BOOLEAN,
  alternatives JSONB NOT NULL DEFAULT '[]',          -- las demás fechas sondeadas (FareCell[])
  stopover_note TEXT,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'applying', 'applied', 'rejected', 'failed', 'superseded')),
  reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  apply_result JSONB
);
CREATE INDEX IF NOT EXISTS idx_requote_alternatives_pkg ON requote_alternatives (package_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requote_alternatives_status ON requote_alternatives (status) WHERE status IN ('proposed', 'approved', 'applying');
ALTER TABLE requote_alternatives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS requote_alternatives_read ON requote_alternatives;
CREATE POLICY requote_alternatives_read ON requote_alternatives FOR SELECT TO authenticated USING (true);
COMMENT ON TABLE requote_alternatives IS 'Propuestas de fecha alternativa dentro de la misma temporada del perfil, cotizadas con el mismo hotel y pasajeros del paquete (cupo agotado → aéreo de sistema).';
