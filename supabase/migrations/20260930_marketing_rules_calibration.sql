-- Fase 4: calibración del criterio con el dry-run del 2026-09-21. Idempotente.
ALTER TABLE marketing_rules ADD COLUMN IF NOT EXISTS ticket_low_usd NUMERIC NOT NULL DEFAULT 700;
ALTER TABLE marketing_rules ADD COLUMN IF NOT EXISTS ticket_high_usd NUMERIC NOT NULL DEFAULT 1800;
ALTER TABLE marketing_rules ADD COLUMN IF NOT EXISTS family_weights JSONB NOT NULL DEFAULT '{"caribe": 15, "brasil": 5, "argentina": -10}';
ALTER TABLE marketing_rules ALTER COLUMN weights SET DEFAULT '{"cupo": 25, "cupo_risk": 15, "grupal": 20, "margin_good": 15, "margin_great": 5, "margin_bad": -20, "trend_opportunity": 15, "trend_rising": 5, "trend_declining": -10, "high_season": 10, "hot_window": 10, "ticket_low": -15, "ticket_high": 0, "cannibalization": -15, "too_close": -25, "profile_violation": -30}';
ALTER TABLE marketing_rules ALTER COLUMN marketing_min SET DEFAULT 55;
ALTER TABLE marketing_rules ALTER COLUMN manual_min SET DEFAULT 20;
ALTER TABLE marketing_rules ALTER COLUMN margin_good_pct SET DEFAULT 10;
ALTER TABLE marketing_rules ALTER COLUMN margin_great_pct SET DEFAULT 12;
-- Sólo si nadie las editó todavía a mano.
UPDATE marketing_rules SET
  weights = weights || '{"grupal": 20, "ticket_low": -15, "ticket_high": 0}'::jsonb,
  marketing_min = 55, manual_min = 20, margin_good_pct = 10, margin_great_pct = 12
WHERE id = 1 AND updated_by IS NULL;
