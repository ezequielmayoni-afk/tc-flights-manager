-- ============================================================================
-- RLS de flight_price_probes
--
-- La tabla la crea 20260920_product.sql y 20260921_vuelos_baratos.sql le suma
-- las columnas del barrido, pero quedó sin RLS: con la anon key cualquiera
-- podía leer (y escribir) las observaciones. Mismo criterio que las otras dos
-- tablas de la landing: lectura para usuarios logueados y nada para anon; las
-- páginas públicas y los jobs escriben con service role (`createAdminClient`),
-- que no pasa por RLS.
--
-- Esta migración solo define políticas: no se aplica a producción acá (lo
-- aplica el controlador). Todo guardado, idempotente.
-- ============================================================================

ALTER TABLE flight_price_probes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flight_price_probes' AND policyname = 'Authenticated users can view flight_price_probes'
  ) THEN
    CREATE POLICY "Authenticated users can view flight_price_probes"
      ON flight_price_probes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
