-- Revisión de cupos agotados que todavía tienen paquetes publicados.
--
-- Cuando un cupo se queda sin lugares pero la salida todavía no ocurrió, los
-- paquetes que lo venden siguen visibles ofreciendo algo que no existe. Esta
-- tabla registra qué se decidió para cada par cupo/paquete, para que la tarea
-- no vuelva a aparecer una vez resuelta.

CREATE TABLE IF NOT EXISTS flight_package_reviews (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER NOT NULL REFERENCES flights(id) ON DELETE CASCADE,
  package_id INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,

  decision TEXT NOT NULL CHECK (decision IN ('deactivated', 'kept_visible')),
  match_criteria TEXT,
  note TEXT,

  -- Foto de cómo estaba el cupo al decidir. Si después se amplía o se liberan
  -- lugares y se vuelve a agotar, los números cambian y la tarea reaparece
  -- sola: es más fiel que un vencimiento por tiempo y no necesita un cron.
  sold_at_review INTEGER,
  quantity_at_review INTEGER,

  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (flight_id, package_id)
);

CREATE INDEX IF NOT EXISTS idx_flight_package_reviews_flight
  ON flight_package_reviews(flight_id);

ALTER TABLE flight_package_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view flight_package_reviews" ON flight_package_reviews;
CREATE POLICY "Authenticated users can view flight_package_reviews"
  ON flight_package_reviews FOR SELECT
  TO authenticated
  USING (true);

-- Aviso a marketing cuando se da de baja un paquete por cupo agotado.
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS notify_cupo_sold_out BOOLEAN DEFAULT TRUE;
