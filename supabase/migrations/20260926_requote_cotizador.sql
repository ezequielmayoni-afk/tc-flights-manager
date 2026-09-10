-- Monitoreo de precios por el cotizador-bot (reemplaza al tc-requote-bot de Playwright).
-- 2026-09-10. Idempotente.

-- quote_runs también guarda las recotizaciones de paquetes publicados.
ALTER TABLE quote_runs DROP CONSTRAINT IF EXISTS quote_runs_purpose_check;
ALTER TABLE quote_runs ADD CONSTRAINT quote_runs_purpose_check
  CHECK (purpose IN ('idea', 'tirada', 'requote_alt', 'manual', 'requote'));
CREATE INDEX IF NOT EXISTS idx_quote_runs_package ON quote_runs (package_id, created_at DESC) WHERE package_id IS NOT NULL;

-- Qué pasó en la última recotización, en palabras, y quién la hizo.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requote_note TEXT;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS requote_source TEXT;
COMMENT ON COLUMN packages.requote_note IS 'Motivo legible de la última recotización (hotel no encontrado, subió X%, sin precio…)';
COMMENT ON COLUMN packages.requote_source IS 'tc_bot (Playwright, hasta 2026-09) | cotizador (job package.requote)';

ALTER TABLE package_requote_logs ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'tc_bot';
ALTER TABLE package_requote_logs ADD COLUMN IF NOT EXISTS quote_run_id BIGINT;

-- Umbral propio del monitoreo (el bot viejo usaba 10 %); distinto del de cambios de precio del import (5 %).
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS requote_variance_threshold_pct NUMERIC NOT NULL DEFAULT 10;
COMMENT ON COLUMN notification_settings.requote_variance_threshold_pct IS 'Suba máxima (%) del precio recotizado sobre el objetivo antes de pasar el paquete a revisión manual';
