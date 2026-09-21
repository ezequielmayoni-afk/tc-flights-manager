-- Fase 4: criterio marketing vs web. 2026-09-21. Idempotente.

CREATE TABLE IF NOT EXISTS marketing_rules (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  -- Pesos del score, editables sin deploy. Negativos = penalización.
  weights JSONB NOT NULL DEFAULT '{"cupo": 25, "cupo_risk": 15, "margin_good": 15, "margin_great": 5, "margin_bad": -20, "trend_opportunity": 15, "trend_rising": 5, "trend_declining": -10, "high_season": 10, "hot_window": 10, "cannibalization": -15, "too_close": -25, "profile_violation": -30}',
  marketing_min NUMERIC NOT NULL DEFAULT 60,
  manual_min NUMERIC NOT NULL DEFAULT 30,
  margin_good_pct NUMERIC NOT NULL DEFAULT 12,
  margin_great_pct NUMERIC NOT NULL DEFAULT 18,
  margin_bad_pct NUMERIC NOT NULL DEFAULT 6,
  min_days_to_departure INTEGER NOT NULL DEFAULT 21,
  cupo_min_seats INTEGER NOT NULL DEFAULT 6,
  cupo_window_from_days INTEGER NOT NULL DEFAULT 30,
  cupo_window_to_days INTEGER NOT NULL DEFAULT 150,
  max_in_marketing_per_destination INTEGER NOT NULL DEFAULT 3,
  auto_approve BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
INSERT INTO marketing_rules (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
ALTER TABLE marketing_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS marketing_rules_read ON marketing_rules;
CREATE POLICY marketing_rules_read ON marketing_rules FOR SELECT TO authenticated USING (true);

ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_track TEXT NOT NULL DEFAULT 'undecided';
ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_marketing_track_check;
ALTER TABLE packages ADD CONSTRAINT packages_marketing_track_check CHECK (marketing_track IN ('undecided', 'web', 'marketing', 'manual', 'excluded'));
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_score NUMERIC;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_track_reason TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_score_details JSONB;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_evaluated_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_track_decided_by TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS marketing_track_decided_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_packages_marketing_track ON packages (marketing_track) WHERE tc_active;
COMMENT ON COLUMN packages.marketing_track IS 'Recomendación del criterio marketing vs web: undecided | web | marketing | manual | excluded. Si marketing_track_decided_by no es null, lo decidió una persona.';
