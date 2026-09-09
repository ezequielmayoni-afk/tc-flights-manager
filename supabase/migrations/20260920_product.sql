-- ============================================================================
-- Fase 3 — Producto: perfiles de destino (usos y costumbres), sondas de
-- fechas, corridas de cotización e ideas de paquete.
-- Todo IF NOT EXISTS; el seed de perfiles es ON CONFLICT DO NOTHING para no
-- pisar lo que Ezequiel edite después.
-- ============================================================================

CREATE TABLE IF NOT EXISTS destination_profiles (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  family TEXT NOT NULL CHECK (family IN ('caribe', 'brasil', 'usa', 'europa', 'medio_oriente_asia', 'argentina', 'sudamerica')),
  tc_destination_code TEXT,
  iata_airport TEXT,
  cotizador_instance TEXT NOT NULL DEFAULT 'emisivo' CHECK (cotizador_instance IN ('emisivo', 'nacional')),
  regimen_required TEXT,
  regimen_allowed TEXT[] NOT NULL DEFAULT '{}',
  nights_default INTEGER NOT NULL DEFAULT 7,
  nights_allowed INTEGER[] NOT NULL DEFAULT '{}',
  stars_default INTEGER NOT NULL DEFAULT 4,
  stars_min INTEGER NOT NULL DEFAULT 3,
  high_season_months INTEGER[] NOT NULL DEFAULT '{}',
  booking_window_days INTEGER NOT NULL DEFAULT 90,
  stopover_threshold_pct NUMERIC,
  stopover_modifiers JSONB NOT NULL DEFAULT '{"short_trip": 10, "kids": 5, "overnight": 12, "origin_interior": -7, "half_direct": 0.66}',
  airlines_by_origin JSONB NOT NULL DEFAULT '{}',
  themes_default TEXT[] NOT NULL DEFAULT '{}',
  direct_required BOOLEAN NOT NULL DEFAULT false,
  auto_publish BOOLEAN NOT NULL DEFAULT false,
  auto_requote BOOLEAN NOT NULL DEFAULT false,
  price_tolerance_pct NUMERIC NOT NULL DEFAULT 3,
  trend_slug TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE destination_profiles IS
  'Usos y costumbres por destino: régimen, noches, categoría, temporada, umbral directo/escala. Ninguna idea llega a siviajo.com sin pasar por acá.';

-- Sondas de precio de aéreo: qué costaba salir tal día según la fuente. Nunca se publica.
CREATE TABLE IF NOT EXISTS flight_price_probes (
  id BIGSERIAL PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  destination_code TEXT,
  departure_date DATE NOT NULL,
  return_date DATE,
  nights INTEGER,
  price_per_pax NUMERIC,
  currency TEXT NOT NULL DEFAULT 'USD',
  airline TEXT,
  flight_numbers TEXT[],
  departure_time TEXT,
  arrival_time TEXT,
  stops INTEGER,
  direct BOOLEAN,
  duration_minutes INTEGER,
  overnight_stop BOOLEAN,
  baggage TEXT,
  booking_class TEXT,
  seats INTEGER,
  source TEXT NOT NULL CHECK (source IN ('tc_search', 'sabre', 'serpapi', 'cotizador_probe', 'manual')),
  raw JSONB,
  idea_id BIGINT,
  cupo_request_id BIGINT,
  job_id BIGINT,
  probed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours'
);

CREATE INDEX IF NOT EXISTS idx_fpp_route_date ON flight_price_probes (origin, destination, departure_date, probed_at DESC);
CREATE INDEX IF NOT EXISTS idx_fpp_idea ON flight_price_probes (idea_id);

-- Cada llamada al cotizador con su pedido y su respuesta completa.
CREATE TABLE IF NOT EXISTS quote_runs (
  id BIGSERIAL PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('idea', 'tirada', 'requote_alt', 'manual')),
  idea_id BIGINT,
  package_id INTEGER,
  cupo_option_id BIGINT,
  instance TEXT NOT NULL DEFAULT 'emisivo',
  request JSONB NOT NULL,
  response JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ok', 'sin_disponibilidad', 'parametros_invalidos', 'error_upstream', 'timeout', 'error')),
  price_pp NUMERIC,
  total_price NUMERIC,
  currency TEXT,
  hotel_name TEXT,
  hotel_code TEXT,
  board TEXT,
  stars INTEGER,
  regimen_confirmed BOOLEAN,
  airline TEXT,
  direct BOOLEAN,
  departure_date DATE,
  return_date DATE,
  warnings TEXT[] NOT NULL DEFAULT '{}',
  elapsed_seconds NUMERIC,
  job_id BIGINT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_quote_runs_idea ON quote_runs (idea_id);
CREATE INDEX IF NOT EXISTS idx_quote_runs_created ON quote_runs (created_at DESC);

-- Ideas de paquete: la unidad del paso "qué producto armar".
CREATE TABLE IF NOT EXISTS package_ideas (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'web' CHECK (kind IN ('web', 'cupo', 'departure')),
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'trend', 'cupo_request', 'departure', 'requote', 'gap')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'probing', 'quoting', 'priced', 'needs_review', 'failed', 'approved', 'rejected', 'saving', 'saved', 'save_unknown', 'verified', 'imported')),
  idempotency_key TEXT UNIQUE,
  title TEXT,
  destination_code TEXT REFERENCES destination_profiles(code),
  destination_name TEXT NOT NULL,
  origin TEXT NOT NULL DEFAULT 'BUE',
  tramos JSONB NOT NULL DEFAULT '[]',
  month TEXT,
  flexibility TEXT,
  departure_date DATE,
  return_date DATE,
  chosen_departure_date DATE,
  date_choice_reason TEXT,
  nights INTEGER NOT NULL DEFAULT 7,
  adults INTEGER NOT NULL DEFAULT 2,
  children INTEGER NOT NULL DEFAULT 0,
  children_ages INTEGER[] NOT NULL DEFAULT '{}',
  regimen TEXT,
  stars_min INTEGER,
  direct_flight BOOLEAN,
  hotel_preferred TEXT,
  budget_max_pp NUMERIC,
  probe_summary JSONB,
  probe_job_id BIGINT,
  quote_run_id BIGINT REFERENCES quote_runs(id),
  quoted_price_pp NUMERIC,
  quoted_currency TEXT,
  quote_summary JSONB,
  validation JSONB NOT NULL DEFAULT '{"ok": true, "hard": [], "soft": []}',
  title_suggested TEXT,
  themes TEXT[] NOT NULL DEFAULT '{}',
  tc_package_id INTEGER,
  package_id INTEGER,
  parent_package_id INTEGER,
  departure_group_id TEXT,
  cupo_option_id BIGINT,
  trend_alert_id UUID,
  saved_via TEXT CHECK (saved_via IS NULL OR saved_via IN ('jsf', 'playwright', 'manual')),
  verification JSONB,
  error TEXT,
  notes TEXT,
  created_by TEXT,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_package_ideas_status ON package_ideas (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_package_ideas_destination ON package_ideas (destination_code);

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS destination_profile_code TEXT,
  ADD COLUMN IF NOT EXISTS family TEXT,
  ADD COLUMN IF NOT EXISTS is_cupo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS profile_violations JSONB,
  ADD COLUMN IF NOT EXISTS idea_id BIGINT,
  ADD COLUMN IF NOT EXISTS themes_local TEXT[],
  ADD COLUMN IF NOT EXISTS themes_pushed_at TIMESTAMPTZ;

-- Kill switch y presupuesto de vuelos-siviajo (Sabre)
INSERT INTO system_flags (key, enabled, reason) VALUES ('automation.vuelos_calls', true, NULL) ON CONFLICT (key) DO NOTHING;
INSERT INTO provider_budgets (provider, daily_cap, monthly_cap, alert_pct) VALUES ('vuelos', 300, 6000, 80) ON CONFLICT (provider) DO NOTHING;
INSERT INTO integration_status (provider) VALUES ('vuelos') ON CONFLICT (provider) DO NOTHING;
INSERT INTO automation_modes (module, mode) VALUES ('idea_probe', 'auto') ON CONFLICT (module) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['destination_profiles', 'flight_price_probes', 'quote_runs', 'package_ideas'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users can view ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'Authenticated users can view ' || t, t);
    END IF;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- Seed de perfiles: reglas del consultor + catálogo del cotizador
-- (codes de core/destinos.py; nacional = instancia 8091).
-- Umbral directo/escala: Brasil corto 30 · Caribe 17 (familia +5 = 22) ·
-- Aruba/Curazao/Jamaica/Colombia/Panamá 7 · USA 17 · Europa 7 · Asia sin umbral.
-- ----------------------------------------------------------------------------
INSERT INTO destination_profiles (code, name, aliases, family, tc_destination_code, iata_airport, cotizador_instance, regimen_required, regimen_allowed, nights_default, nights_allowed, stars_default, stars_min, high_season_months, booking_window_days, stopover_threshold_pct, airlines_by_origin, themes_default, direct_required, trend_slug, notes) VALUES
  ('PUJ', 'Punta Cana', '{"punta cana","bavaro","bávaro","cap cana","uvero alto"}', 'caribe', 'PUJ', 'PUJ', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8,9,10,14}', 5, 4, '{1,2,7,12}', 90, 17, '{"EZE": ["AR", "CM"], "COR": ["CM"], "ROS": ["CM"]}', '{Caribe,"All inclusive"}', false, 'punta-cana', 'Resort de marca; se vende por hotel más que por estrellas.'),
  ('BAY', 'Bayahibe', '{"bayahibe","la romana","dominicus"}', 'caribe', 'BAY', 'PUJ', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8,9,10}', 5, 4, '{1,2,7,12}', 90, 17, '{"EZE": ["AR", "CM"]}', '{Caribe,"All inclusive"}', false, 'bayahibe', 'Se vuela a Punta Cana; traslado 1 h 20.'),
  ('POP', 'Puerto Plata', '{"puerto plata","playa dorada"}', 'caribe', 'POP', 'POP', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8}', 4, 4, '{1,2,7}', 90, 7, '{}', '{Caribe,"All inclusive"}', false, 'puerto-plata', 'Sin directo desde Argentina.'),
  ('CUN', 'Cancún', '{"cancun","cancún","costa mujeres"}', 'caribe', 'CUN', 'CUN', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8,10}', 5, 4, '{1,2,7,12}', 90, 17, '{"EZE": ["AR", "CM", "AM"]}', '{Caribe,"All inclusive",México}', false, 'cancun', NULL),
  ('PCM', 'Riviera Maya', '{"riviera maya","playa del carmen","tulum","akumal"}', 'caribe', 'PCM', 'CUN', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8,10}', 5, 4, '{1,2,7,12}', 90, 17, '{"EZE": ["AR", "CM", "AM"]}', '{Caribe,"All inclusive",México}', false, 'riviera-maya', 'Se vuela a Cancún.'),
  ('AUA', 'Aruba', '{"aruba","oranjestad","palm beach","eagle beach"}', 'caribe', 'AUA', 'AUA', 'emisivo', 'all_inclusive', '{all_inclusive,desayuno}', 7, '{7,8,10}', 4, 4, '{1,2,7,12}', 90, 7, '{"EZE": ["CM", "AV"]}', '{Caribe,"All inclusive"}', false, 'aruba', 'Casi siempre con escala (Panamá o Bogotá).'),
  ('CUA', 'Curaçao', '{"curazao","curaçao","curacao"}', 'caribe', 'CUA', 'CUR', 'emisivo', 'all_inclusive', '{all_inclusive,desayuno}', 7, '{7,8,10}', 4, 4, '{1,2,7,12}', 90, 7, '{"EZE": ["CM", "AV"]}', '{Caribe,"All inclusive"}', false, 'curacao', NULL),
  ('MBJ', 'Jamaica', '{"jamaica","montego bay","negril","ocho rios"}', 'caribe', NULL, 'MBJ', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8,10}', 5, 4, '{1,2,7,12}', 90, 7, '{"EZE": ["CM"]}', '{Caribe,"All inclusive"}', false, 'jamaica', 'Sin directo; vía Panamá.'),
  ('CTG', 'Cartagena', '{"cartagena","cartagena de indias"}', 'caribe', NULL, 'CTG', 'emisivo', NULL, '{desayuno,all_inclusive,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{1,2,7,12}', 60, 7, '{"EZE": ["AV", "CM"]}', '{Caribe,Colombia}', false, 'cartagena', NULL),
  ('ADZ', 'San Andrés', '{"san andres","san andrés","san andres colombia"}', 'caribe', NULL, 'ADZ', 'emisivo', 'all_inclusive', '{all_inclusive,desayuno}', 7, '{5,6,7,8}', 4, 3, '{1,2,7,12}', 60, 7, '{"EZE": ["AV", "CM"]}', '{Caribe,Colombia,"All inclusive"}', false, 'san-andres', NULL),
  ('PTY', 'Panamá', '{"panama","panamá","ciudad de panama"}', 'caribe', NULL, 'PTY', 'emisivo', NULL, '{desayuno,sin_pension}', 4, '{3,4,5}', 4, 3, '{7,12}', 45, 7, '{"EZE": ["CM"]}', '{Caribe,Panamá}', false, 'panama', 'Suele ir combinado con Caribe.'),
  ('RIO', 'Rio de Janeiro', '{"rio","rio de janeiro","río de janeiro","copacabana","ipanema"}', 'brasil', 'RIO', 'GIG', 'emisivo', NULL, '{desayuno,sin_pension}', 7, '{5,6,7,8}', 4, 3, '{1,2,7,12}', 60, 30, '{"EZE": ["AR", "LA", "G3"], "COR": ["G3", "LA"], "ROS": ["G3"]}', '{Brasil,Playa}', true, 'rio-de-janeiro', 'Directo indispensable. Desayuno o sin pensión.'),
  ('BZI', 'Búzios', '{"buzios","búzios"}', 'brasil', 'BZI', 'GIG', 'emisivo', NULL, '{desayuno,sin_pension}', 7, '{5,6,7,8}', 4, 3, '{1,2,12}', 60, 30, '{"EZE": ["AR", "LA", "G3"]}', '{Brasil,Playa}', true, 'buzios', 'Se vuela a Río; traslado 2 h 30.'),
  ('FLO', 'Florianópolis', '{"florianopolis","florianópolis","floripa","canasvieiras","jurere"}', 'brasil', 'FLO', 'FLN', 'emisivo', NULL, '{desayuno,sin_pension}', 7, '{6,7,8}', 4, 3, '{1,2,12}', 60, 30, '{"EZE": ["AR", "LA", "G3", "FO"], "COR": ["FO", "AR"], "ROS": ["FO"]}', '{Brasil,Playa}', true, 'florianopolis', 'Directo indispensable; el interior también tiene directos.'),
  ('MAO', 'Maceió', '{"maceio","maceió"}', 'brasil', 'MAO', 'MCZ', 'emisivo', 'all_inclusive', '{all_inclusive,desayuno}', 7, '{7,8,10}', 4, 4, '{1,2,7,12}', 90, 30, '{"EZE": ["G3", "AR"]}', '{Brasil,Nordeste,"All inclusive"}', false, 'maceio', 'Nordeste resort: all inclusive y 7 noches.'),
  ('MGG', 'Maragogi', '{"maragogi","japaratinga"}', 'brasil', NULL, 'MCZ', 'emisivo', 'all_inclusive', '{all_inclusive}', 7, '{7,8}', 5, 4, '{1,2,7,12}', 90, 30, '{"EZE": ["G3", "AR"]}', '{Brasil,Nordeste,"All inclusive"}', false, 'maragogi', 'Se vuela a Maceió; resorts Salinas/Grand Oca.'),
  ('PDG', 'Porto de Galinhas', '{"porto de galinhas","muro alto"}', 'brasil', 'PDG', 'REC', 'emisivo', 'all_inclusive', '{all_inclusive,desayuno}', 7, '{7,8}', 5, 4, '{1,2,7,12}', 90, 30, '{"EZE": ["G3", "AR"]}', '{Brasil,Nordeste,"All inclusive"}', false, 'porto-de-galinhas', 'Se vuela a Recife.'),
  ('NAT', 'Natal', '{"natal","pipa","praia da pipa"}', 'brasil', NULL, 'NAT', 'emisivo', NULL, '{all_inclusive,desayuno}', 7, '{7,8}', 4, 4, '{1,2,7,12}', 90, 30, '{"EZE": ["G3"]}', '{Brasil,Nordeste}', false, 'natal', 'Sin mapeo estático en el cotizador: resuelve por autocompletado.'),
  ('SSA', 'Salvador de Bahía', '{"salvador","salvador de bahia","salvador de bahía","praia do forte","costa do sauipe","imbassai"}', 'brasil', NULL, 'SSA', 'emisivo', NULL, '{all_inclusive,desayuno}', 7, '{7,8}', 4, 4, '{1,2,7,12}', 90, 30, '{"EZE": ["G3", "AR"]}', '{Brasil,Nordeste}', false, 'salvador-de-bahia', 'Sin mapeo estático en el cotizador.'),
  ('MIA', 'Miami', '{"miami","miami beach","fort lauderdale"}', 'usa', 'MIA', 'MIA', 'emisivo', NULL, '{sin_pension,desayuno}', 7, '{5,6,7,8,10}', 4, 3, '{1,7,12}', 75, 17, '{"EZE": ["AR", "AA", "LA"]}', '{"Estados Unidos",Compras}', false, 'miami', 'Sin pensión y auto.'),
  ('MCO', 'Orlando', '{"orlando","disney","disney world","universal"}', 'usa', 'MCO', 'MCO', 'emisivo', NULL, '{sin_pension,desayuno}', 8, '{7,8,10,12}', 3, 3, '{1,7,12}', 90, 17, '{"EZE": ["AR", "AA", "LA"]}', '{"Estados Unidos",Disney,Familia}', false, 'disney', 'Parques: sin pensión; entradas aparte.'),
  ('NYC', 'Nueva York', '{"nueva york","new york","manhattan"}', 'usa', NULL, 'JFK', 'emisivo', NULL, '{sin_pension,desayuno}', 6, '{5,6,7,8}', 4, 3, '{12,7}', 75, 17, '{"EZE": ["AR", "AA", "UA"]}', '{"Estados Unidos",Ciudad}', false, 'nueva-york', NULL),
  ('MAD', 'Madrid', '{"madrid"}', 'europa', 'MAD', 'MAD', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,12}', 90, 7, '{"EZE": ["AR", "IB", "UX"]}', '{Europa,España,Ciudad}', false, 'madrid', NULL),
  ('BCN', 'Barcelona', '{"barcelona"}', 'europa', 'BCN', 'BCN', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,12}', 90, 7, '{"EZE": ["LEVEL", "IB"]}', '{Europa,España,Ciudad}', false, 'barcelona', NULL),
  ('ROE', 'Roma', '{"roma","rome"}', 'europa', 'ROE', 'FCO', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,12}', 90, 7, '{"EZE": ["AR", "AZ"]}', '{Europa,Italia,Ciudad}', false, 'roma', NULL),
  ('PAR', 'París', '{"paris","parís"}', 'europa', 'PAR', 'CDG', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,12}', 90, 7, '{"EZE": ["AF"]}', '{Europa,Francia,Ciudad}', false, 'paris', NULL),
  ('LIS', 'Lisboa', '{"lisboa","lisbon","portugal"}', 'europa', NULL, 'LIS', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8}', 90, 7, '{"EZE": ["TP"]}', '{Europa,Portugal,Ciudad}', false, 'lisboa', NULL),
  ('LON', 'Londres', '{"londres","london"}', 'europa', NULL, 'LHR', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,12}', 90, 7, '{"EZE": ["BA"]}', '{Europa,Ciudad}', false, 'londres', NULL),
  ('IST', 'Estambul', '{"estambul","istanbul","turquia","turquía"}', 'europa', NULL, 'IST', 'emisivo', NULL, '{desayuno}', 5, '{4,5,6,7}', 4, 3, '{7,8}', 90, 7, '{"EZE": ["TK"]}', '{Europa,Turquía,Ciudad}', false, 'estambul', 'TK directo; circuito Turquía 10–12 noches.'),
  ('GRC', 'Grecia', '{"grecia","atenas","athens","santorini","mykonos"}', 'europa', NULL, 'ATH', 'emisivo', NULL, '{desayuno}', 8, '{7,8,10,12}', 4, 3, '{6,7,8,9}', 120, 7, '{}', '{Europa,Grecia,Islas}', false, 'grecia', 'Islas: junio a septiembre.'),
  ('EUR-CIRC', 'Europa circuito', '{"europa","circuito europa","europa clasica","europa clásica"}', 'europa', NULL, 'MAD', 'emisivo', NULL, '{desayuno,media_pension}', 15, '{14,15,17,18,21}', 4, 3, '{7,8,12}', 120, 7, '{}', '{Europa,Circuito}', false, 'europa', 'Circuito 15–21 días con desayuno o media pensión.'),
  ('DXB', 'Dubai', '{"dubai","dubái","emiratos"}', 'medio_oriente_asia', NULL, 'DXB', 'emisivo', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 5, 4, '{11,12,1,2,3}', 90, NULL, '{"EZE": ["EK"]}', '{"Medio Oriente",Lujo}', false, 'dubai', 'Sin umbral: manda el precio.'),
  ('CAI', 'Egipto', '{"egipto","el cairo","cairo","luxor"}', 'medio_oriente_asia', NULL, 'CAI', 'emisivo', NULL, '{desayuno,media_pension}', 10, '{8,10,12}', 4, 4, '{10,11,12,1,2,3}', 120, NULL, '{}', '{"Medio Oriente",Circuito}', false, 'egipto', 'Circuito con crucero por el Nilo.'),
  ('BKK', 'Tailandia', '{"tailandia","bangkok","phuket","krabi"}', 'medio_oriente_asia', NULL, 'BKK', 'emisivo', NULL, '{desayuno}', 12, '{10,12,14,15}', 4, 4, '{11,12,1,2,3}', 120, NULL, '{}', '{Asia,Tailandia}', false, 'tailandia', NULL),
  ('TYO', 'Japón', '{"japon","japón","tokio","tokyo","kioto","kyoto"}', 'medio_oriente_asia', NULL, 'NRT', 'emisivo', NULL, '{desayuno}', 12, '{10,12,14,15}', 4, 3, '{3,4,10,11}', 150, NULL, '{}', '{Asia,Japón,Circuito}', false, 'japon', 'Sakura (marzo-abril) y otoño.'),
  ('MLE', 'Maldivas', '{"maldivas","maldives"}', 'medio_oriente_asia', NULL, 'MLE', 'emisivo', 'all_inclusive', '{all_inclusive,media_pension}', 7, '{5,6,7}', 5, 4, '{11,12,1,2,3}', 120, NULL, '{}', '{Asia,Lujo,"Luna de miel"}', false, 'maldivas', NULL),
  ('DPS', 'Bali', '{"bali","indonesia"}', 'medio_oriente_asia', NULL, 'DPS', 'emisivo', NULL, '{desayuno}', 10, '{8,10,12}', 4, 4, '{6,7,8,9}', 120, NULL, '{}', '{Asia,Bali}', false, 'bali', NULL),
  ('BCH', 'Bariloche', '{"bariloche","san carlos de bariloche","cerro catedral"}', 'argentina', 'BCH', 'BRC', 'nacional', NULL, '{desayuno,sin_pension,media_pension}', 5, '{4,5,6,7}', 4, 3, '{7,8,1,2}', 60, 30, '{"EZE": ["AR", "FO", "JA"], "AEP": ["AR", "JA"], "COR": ["AR", "FO"]}', '{Argentina,Patagonia,Nieve}', false, 'bariloche', 'Invierno = ski; verano = lagos.'),
  ('MEZ', 'Mendoza', '{"mendoza"}', 'argentina', 'MEZ', 'MDZ', 'nacional', NULL, '{desayuno,sin_pension}', 4, '{3,4,5}', 4, 3, '{3,7,10}', 45, 30, '{"AEP": ["AR", "JA", "FO"]}', '{Argentina,Vino}', false, 'mendoza', 'Vendimia en marzo.'),
  ('SLT', 'Salta', '{"salta","jujuy","norte argentino","salta y jujuy"}', 'argentina', 'SLT', 'SLA', 'nacional', NULL, '{desayuno,sin_pension}', 5, '{4,5,6,7}', 4, 3, '{7,4,10}', 45, 30, '{"AEP": ["AR", "JA", "FO"]}', '{Argentina,Norte}', false, 'salta', NULL),
  ('IGU', 'Iguazú', '{"iguazu","iguazú","cataratas","cataratas del iguazu","puerto iguazu"}', 'argentina', 'IGU', 'IGR', 'nacional', NULL, '{desayuno,sin_pension}', 3, '{2,3,4}', 4, 3, '{7,1,4}', 45, 30, '{"AEP": ["AR", "JA", "FO"]}', '{Argentina,Cataratas}', false, 'iguazu', NULL),
  ('USH', 'Ushuaia', '{"ushuaia","fin del mundo","tierra del fuego"}', 'argentina', 'USH', 'USH', 'nacional', NULL, '{desayuno,sin_pension}', 4, '{3,4,5}', 4, 3, '{7,8,1,2}', 60, 30, '{"AEP": ["AR", "JA", "FO"]}', '{Argentina,Patagonia}', false, 'ushuaia', NULL),
  ('CFE-1', 'El Calafate', '{"el calafate","calafate","glaciar perito moreno"}', 'argentina', 'CFE-1', 'FTE', 'nacional', NULL, '{desayuno,sin_pension}', 4, '{3,4,5}', 4, 3, '{1,2,10,11}', 60, 30, '{"AEP": ["AR", "JA", "FO"]}', '{Argentina,Patagonia,Glaciares}', false, 'el-calafate', NULL),
  ('CUZ', 'Cusco y Machu Picchu', '{"cusco","cuzco","machu picchu","peru","perú"}', 'sudamerica', NULL, 'CUZ', 'emisivo', NULL, '{desayuno}', 5, '{4,5,6,7}', 4, 3, '{6,7,8}', 75, 7, '{"EZE": ["LA"]}', '{Perú,Machu Picchu}', false, 'cusco', 'Vía Lima.'),
  ('SCL', 'Santiago de Chile', '{"santiago","santiago de chile","chile","valle nevado"}', 'sudamerica', NULL, 'SCL', 'emisivo', NULL, '{desayuno,sin_pension}', 4, '{3,4,5,7}', 4, 3, '{7,8}', 45, 30, '{"EZE": ["LA", "AR", "JA"]}', '{Chile,Nieve}', false, 'chile', 'Invierno = ski (Valle Nevado, Portillo).')
ON CONFLICT (code) DO NOTHING;
