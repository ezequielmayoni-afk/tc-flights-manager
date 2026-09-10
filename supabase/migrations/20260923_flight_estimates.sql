-- ============================================================================
-- vuelos.siviajo.com — estimaciones de Sabre (BargainFinderMax)
--
-- El barrido nocturno sondea siviajo.com (cotizador-bot) y eso es caro: un
-- solo worker, 3 llamadas por minuto. Sabre entra ANTES, como estimador: una
-- búsqueda BFM por par de fechas ordena el mes por precio aproximado y recién
-- después siviajo.com confirma los pares que valen la pena.
--
-- La estimación NUNCA se publica como precio: sale del PCC propio, sin el
-- markup ni las reglas del motor de reservas. Solo elige fechas.
-- Esta migración solo crea el esquema: no se aplica a producción acá (lo
-- aplica el controlador). Todo IF NOT EXISTS, idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Estimaciones por par de fechas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_fare_estimates (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES flight_landing_routes(id) ON DELETE CASCADE,
  depart_date DATE NOT NULL,
  return_date DATE NOT NULL,
  price_pp NUMERIC(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  airline_code TEXT,
  stops_out INTEGER,
  stops_back INTEGER,
  duration_out_minutes INTEGER,
  duration_back_minutes INTEGER,
  -- Hasta 5 itinerarios resumidos (BfmItinerary de src/lib/sabre/client.ts).
  itineraries JSONB NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'sabre_bfm' CHECK (source IN ('sabre_bfm')),
  job_id BIGINT,
  elapsed_ms INTEGER,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una estimación vigente por par de fechas y fuente: el job la pisa (upsert).
  UNIQUE (route_id, depart_date, return_date, source)
);

CREATE INDEX IF NOT EXISTS idx_ffe_route_observed ON flight_fare_estimates (route_id, observed_at DESC);

COMMENT ON TABLE flight_fare_estimates IS
  'Estimaciones de Sabre (BFM, PCC propio) por par de fechas. Nunca se publican como precio confirmado: sirven para elegir qué fechas sondea siviajo.com.';

-- ----------------------------------------------------------------------------
-- 2. Cupos por ruta: cuántas fechas estima Sabre y cuántas confirma siviajo
-- ----------------------------------------------------------------------------
ALTER TABLE flight_landing_routes
  ADD COLUMN IF NOT EXISTS scan_per_month INTEGER NOT NULL DEFAULT 8 CHECK (scan_per_month BETWEEN 0 AND 62);
ALTER TABLE flight_landing_routes
  ADD COLUMN IF NOT EXISTS confirm_per_month INTEGER NOT NULL DEFAULT 3 CHECK (confirm_per_month BETWEEN 1 AND 31);

COMMENT ON COLUMN flight_landing_routes.scan_per_month IS
  'Pares de fechas por mes que Sabre (BFM) estima por noche; 0 = sin estimador para la ruta.';
COMMENT ON COLUMN flight_landing_routes.confirm_per_month IS
  'De los pares estimados, cuántos por mes confirma siviajo.com (sondas del cotizador-bot).';

-- ----------------------------------------------------------------------------
-- 3. Kill switch y presupuesto del estimador
--    (una unidad = una transacción de BargainFinderMax)
-- ----------------------------------------------------------------------------
INSERT INTO system_flags (key, enabled, reason) VALUES ('automation.sabre_calls', TRUE, 'Estimador Sabre (BFM) para vuelos.siviajo.com') ON CONFLICT (key) DO NOTHING;
INSERT INTO provider_budgets (provider, daily_cap, monthly_cap) VALUES ('sabre', 1500, 30000) ON CONFLICT (provider) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. RLS: lectura para usuarios logueados; los jobs escriben con service role.
-- ----------------------------------------------------------------------------
ALTER TABLE flight_fare_estimates ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flight_fare_estimates' AND policyname = 'Authenticated users can view flight_fare_estimates'
  ) THEN
    CREATE POLICY "Authenticated users can view flight_fare_estimates"
      ON flight_fare_estimates FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
