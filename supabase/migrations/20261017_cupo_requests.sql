-- Fase 7: pedido de cupos a aéreos dentro de HUB (reemplaza el Excel y los mails). 2026-10-17. Idempotente.

CREATE TABLE IF NOT EXISTS cupo_requests (
  id SERIAL PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','probing','ready','sent','answered','confirming','confirmed','loaded','closed','cancelled')),
  title TEXT NOT NULL,
  origin_code TEXT NOT NULL,              -- código TC del origen (BUE, COR, ROS…)
  origin_name TEXT,
  destination_code TEXT NOT NULL,         -- código TC del destino (PUJ, FLO, MBJ-1…)
  destination_name TEXT NOT NULL,
  destination_profile_code TEXT,
  months TEXT[] NOT NULL DEFAULT '{}',    -- 'YYYY-MM'
  weekdays INTEGER[] NOT NULL DEFAULT '{4,6}', -- 0 = domingo … 6 = sábado; días de salida a sondear
  nights INTEGER NOT NULL,
  seats_requested INTEGER NOT NULL,
  adults INTEGER NOT NULL DEFAULT 2,
  children_ages INTEGER[] NOT NULL DEFAULT '{}',
  airline_pref TEXT[] NOT NULL DEFAULT '{}',
  direct_only BOOLEAN NOT NULL DEFAULT false,
  max_options INTEGER NOT NULL DEFAULT 5,
  notes TEXT,
  requested_by TEXT,
  probe_job_id BIGINT,
  probe_error TEXT,
  last_probe_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  sent_by TEXT,
  response_deadline_at TIMESTAMPTZ,
  answered_at TIMESTAMPTZ,
  answered_by TEXT,
  response_hours NUMERIC GENERATED ALWAYS AS (EXTRACT(EPOCH FROM (answered_at - sent_at)) / 3600.0) STORED,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  slack_message_ts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cupo_requests_status ON cupo_requests (status);

CREATE TABLE IF NOT EXISTS cupo_request_options (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES cupo_requests(id) ON DELETE CASCADE,
  rank INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'probed' CHECK (status IN ('probed','requested','quoted','accepted','rejected','loaded')),
  departure_date DATE NOT NULL,
  return_date DATE NOT NULL,
  nights INTEGER NOT NULL,
  airline TEXT,
  airline_code TEXT,
  flight_out TEXT,
  flight_back TEXT,
  depart_out TEXT,
  arrive_out TEXT,
  depart_back TEXT,
  arrive_back TEXT,
  stops_out INTEGER,
  stops_back INTEGER,
  direct BOOLEAN,
  fare_family TEXT,
  checked_bag BOOLEAN,
  seats INTEGER NOT NULL,
  -- precio de sistema (sonda del cotizador, por persona ida y vuelta) y precio que contesta aéreos
  system_price_pp NUMERIC,
  system_currency TEXT DEFAULT 'USD',
  system_probed_at TIMESTAMPTZ,
  market_price_pp NUMERIC,                -- queda para cuando vuelos-siviajo/Sabre esté desplegado
  airline_price_pp NUMERIC,
  airline_currency TEXT DEFAULT 'USD',
  airline_notes TEXT,
  airline_quoted_at TIMESTAMPTZ,
  delta_pct NUMERIC GENERATED ALWAYS AS (CASE WHEN system_price_pp > 0 AND airline_price_pp IS NOT NULL THEN ROUND((airline_price_pp - system_price_pp) / system_price_pp * 100, 1) ELSE NULL END) STORED,
  decision_reason TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ,
  flight_id INTEGER,                      -- vuelo de ida creado en HUB al cargar el cupo
  return_flight_id INTEGER,
  idea_id INTEGER,
  probe_options JSONB,                    -- las demás opciones de la sonda para esa fecha
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, departure_date, airline_code, flight_out)
);
CREATE INDEX IF NOT EXISTS idx_cupo_request_options_request ON cupo_request_options (request_id, rank);

ALTER TABLE cupo_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE cupo_request_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cupo_requests_read ON cupo_requests;
CREATE POLICY cupo_requests_read ON cupo_requests FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS cupo_request_options_read ON cupo_request_options;
CREATE POLICY cupo_request_options_read ON cupo_request_options FOR SELECT TO authenticated USING (true);

ALTER TABLE flights ADD COLUMN IF NOT EXISTS cost_per_seat NUMERIC;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS cost_currency TEXT;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS deposit_due_date DATE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS cupo_option_id INTEGER;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS risk_level TEXT;
COMMENT ON COLUMN flights.cost_per_seat IS 'Lo que aéreos cobra por plaza (ida y vuelta, por persona). Viene del pedido de cupos.';
COMMENT ON COLUMN flights.risk_level IS 'green | yellow | red según lugares sin vender y días a la salida (job cupo.risk_eval)';
