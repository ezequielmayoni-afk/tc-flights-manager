-- Cupos de operadores cargados a la web (2026-10-26). Idempotente.
-- Un vuelo (ida y vuelta) creado desde una tarifa de operator_cupos guarda de dónde salió, para no cargarlo dos veces.
ALTER TABLE flights ADD COLUMN IF NOT EXISTS source_operator TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS operator_cupo_id BIGINT;
CREATE INDEX IF NOT EXISTS idx_flights_operator_cupo ON flights (operator_cupo_id) WHERE operator_cupo_id IS NOT NULL;
COMMENT ON COLUMN flights.operator_cupo_id IS 'operator_cupos.id de la tarifa del operador (Eurovips…) con la que se cargó este cupo; null = cupo propio.';
