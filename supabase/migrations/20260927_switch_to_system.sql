-- Cupo agotado → aéreo de sistema (2026-09-11). Idempotente.

-- La revisión de un cupo agotado también puede terminar en "pasó a sistema".
ALTER TABLE flight_package_reviews DROP CONSTRAINT IF EXISTS flight_package_reviews_decision_check;
ALTER TABLE flight_package_reviews ADD CONSTRAINT flight_package_reviews_decision_check
  CHECK (decision IN ('deactivated', 'kept_visible', 'switched_to_system'));

-- Quién y cuándo convirtió el paquete: el ID, la URL y los anuncios siguen iguales.
ALTER TABLE packages ADD COLUMN IF NOT EXISTS switched_to_system_at TIMESTAMPTZ;
ALTER TABLE packages ADD COLUMN IF NOT EXISTS switched_to_system_by TEXT;
COMMENT ON COLUMN packages.switched_to_system_at IS 'Cuándo se cambió el cupo agotado por una tarifa de sistema en TC (mismo ID, misma URL, mismos anuncios)';
