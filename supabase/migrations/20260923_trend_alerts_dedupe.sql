-- Tendencias: una alerta por condición, no una por corrida. Mientras la
-- condición siga (mismo destino, mismo tipo, misma consulta) no se repite;
-- cuando desaparece en una corrida nueva, se cierra sola como "superseded".
ALTER TABLE trend_alerts ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

ALTER TABLE trend_alerts DROP CONSTRAINT IF EXISTS trend_alerts_action_taken_check;
ALTER TABLE trend_alerts ADD CONSTRAINT trend_alerts_action_taken_check
  CHECK (action_taken IS NULL OR action_taken IN ('idea_created', 'dismissed', 'superseded'));

CREATE INDEX IF NOT EXISTS idx_trend_alerts_dedupe_open ON trend_alerts (dedupe_key) WHERE acknowledged = false;

-- Clave para las alertas que ya existen
UPDATE trend_alerts
SET dedupe_key = alert_type || ':' || coalesce(data->>'destinationSlug', lower(destination)) || coalesce(':' || (data->>'query'), '')
WHERE dedupe_key IS NULL;
