-- Pedido de cupos con una sola aerolínea + metadata de vuelos (2026-10-20). Idempotente.
-- 1) Cotizaciones del bot del CRM como observaciones de precio (source = 'crm_quote').
ALTER TABLE flight_price_probes DROP CONSTRAINT IF EXISTS flight_price_probes_source_check;
ALTER TABLE flight_price_probes ADD CONSTRAINT flight_price_probes_source_check CHECK (source = ANY (ARRAY['tc_search','sabre','serpapi','cotizador_probe','manual','crm_quote']));
CREATE UNIQUE INDEX IF NOT EXISTS uq_fpp_crm_quote ON flight_price_probes ((raw->>'crm_log_id'), departure_date, return_date) WHERE source = 'crm_quote';
CREATE INDEX IF NOT EXISTS idx_fpp_dest_dep ON flight_price_probes (destination_code, departure_date) WHERE status = 'ok';
COMMENT ON COLUMN flight_price_probes.source IS 'cotizador_probe (sondas), tc_search (búsquedas reales en siviajo.com), crm_quote (cotizaciones del bot del CRM: fechas sondeadas con precio del aéreo pp), sabre, serpapi, manual';
-- 2) Pedido: misma aerolínea en todas las tiradas y el análisis que la eligió.
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS single_airline BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS airline_analysis JSONB;
COMMENT ON COLUMN cupo_requests.airline_analysis IS 'Comparación de aerolíneas del último sondeo (cobertura, precio, directos, historial de la ruta, mercado y demanda) y la elegida; guarda la mejor opción por aerolínea y fecha para cambiar de aerolínea sin volver a sondear.';
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS market_source TEXT;
-- Sigue el estado del cursor de la ingesta del CRM.
CREATE TABLE IF NOT EXISTS ingest_cursors (name TEXT PRIMARY KEY, cursor_at TIMESTAMPTZ, updated_at TIMESTAMPTZ NOT NULL DEFAULT now(), details JSONB);
ALTER TABLE ingest_cursors ENABLE ROW LEVEL SECURITY;
