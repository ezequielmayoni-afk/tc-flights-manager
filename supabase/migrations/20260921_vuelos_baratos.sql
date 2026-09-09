-- ============================================================================
-- vuelos.siviajo.com — landing pública de "vuelos baratos a <destino>"
--
-- Esquema para el barrido nocturno que sondea siviajo.com vía el
-- cotizador-bot y alimenta la landing estilo TurismoCity. Esta migración
-- solo crea el esquema: no se aplica a producción acá (lo aplica el
-- controlador).
-- Todo IF NOT EXISTS, idempotente (se puede aplicar dos veces sin error).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Destinos publicados en la landing (extensión 1:1 de destination_profiles)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_landing_destinations (
  code TEXT PRIMARY KEY REFERENCES destination_profiles(code) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,              -- 'miami'
  tc_code TEXT NOT NULL,                  -- código de DESTINO de Travel Compositor ('MIA','ROE','FLO','NYC'); NO es el IATA
  iata_display TEXT,                      -- 'MIA' solo para mostrar
  haul TEXT NOT NULL CHECK (haul IN ('short','medium','long')),
  seo_title TEXT, seo_description TEXT, hero_image_url TEXT,
  faq JSONB NOT NULL DEFAULT '[]',
  active BOOLEAN NOT NULL DEFAULT false,  -- publicada en la landing
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE flight_landing_destinations IS
  'Destinos publicados en vuelos.siviajo.com. tc_code es el código de destino de Travel Compositor (core/destinos.py del cotizador-bot), no el IATA del aeropuerto.';

-- ----------------------------------------------------------------------------
-- 2. Rutas del barrido nocturno: origen × destino, con la configuración de
--    sondas por mes (freno look-to-book).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS flight_landing_routes (
  id BIGSERIAL PRIMARY KEY,
  destination_code TEXT NOT NULL REFERENCES flight_landing_destinations(code) ON DELETE CASCADE,
  origin_tc_code TEXT NOT NULL,           -- 'BUE','CRD','RO6','MEZ' (códigos TC)
  origin_name TEXT NOT NULL,              -- 'Buenos Aires','Córdoba','Rosario','Mendoza'
  stay_nights INTEGER[] NOT NULL DEFAULT '{7,10,14}',
  weekdays INTEGER[] NOT NULL DEFAULT '{2,5}',        -- ISO: 1=lunes … 7=domingo
  probes_per_month INTEGER NOT NULL DEFAULT 8 CHECK (probes_per_month BETWEEN 1 AND 31),
  months_ahead INTEGER NOT NULL DEFAULT 12 CHECK (months_ahead BETWEEN 1 AND 18),
  active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (destination_code, origin_tc_code)
);

CREATE INDEX IF NOT EXISTS idx_flr_active ON flight_landing_routes (active, destination_code);

COMMENT ON TABLE flight_landing_routes IS
  'Rutas del barrido nocturno de vuelos.siviajo.com: qué origen × destino se sondea, con qué estadías y cuántas sondas por mes (freno look-to-book).';

-- ----------------------------------------------------------------------------
-- 3. flight_price_probes: columnas del barrido de vuelos.siviajo.com
--    (la tabla ya existe, ver supabase/migrations/20260920_product.sql).
-- ----------------------------------------------------------------------------
ALTER TABLE flight_price_probes
  ADD COLUMN IF NOT EXISTS route_id BIGINT REFERENCES flight_landing_routes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS adults INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS airline_code TEXT,
  ADD COLUMN IF NOT EXISTS stops_back INTEGER,
  ADD COLUMN IF NOT EXISTS duration_back_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS fare_family TEXT,
  ADD COLUMN IF NOT EXISTS checked_bag BOOLEAN,
  ADD COLUMN IF NOT EXISTS carry_on BOOLEAN,
  ADD COLUMN IF NOT EXISTS options JSONB,
  ADD COLUMN IF NOT EXISTS elapsed_ms INTEGER,
  ADD COLUMN IF NOT EXISTS error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'flight_price_probes_status_check'
  ) THEN
    ALTER TABLE flight_price_probes
      ADD CONSTRAINT flight_price_probes_status_check
      CHECK (status IN ('ok', 'empty', 'error', 'timeout'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_fpp_route_probed ON flight_price_probes (route_id, probed_at DESC) WHERE status = 'ok';
CREATE INDEX IF NOT EXISTS idx_fpp_route_pair ON flight_price_probes (route_id, departure_date, return_date, probed_at DESC) WHERE status = 'ok';

COMMENT ON COLUMN flight_price_probes.route_id IS
  'Ruta del barrido de vuelos.siviajo.com (null para sondas de ideas de la Fase 3).';

-- ----------------------------------------------------------------------------
-- 4. Completar códigos TC faltantes en perfiles existentes (solo si son NULL)
-- ----------------------------------------------------------------------------
UPDATE destination_profiles SET tc_destination_code = 'SCL' WHERE code = 'SCL' AND tc_destination_code IS NULL;
UPDATE destination_profiles SET tc_destination_code = 'NYC' WHERE code = 'NYC' AND tc_destination_code IS NULL;

-- ----------------------------------------------------------------------------
-- 5. Seeds
-- ----------------------------------------------------------------------------

-- Destinos: todos activos=false salvo MIA (arranca publicado).
INSERT INTO flight_landing_destinations (code, slug, tc_code, iata_display, haul, active, sort_order) VALUES
  ('MIA', 'miami',             'MIA', 'MIA', 'long',  true,  10),
  ('MAD', 'madrid',            'MAD', 'MAD', 'long',  false, 20),
  ('RIO', 'rio-de-janeiro',    'RIO', 'GIG', 'short', false, 30),
  ('FLO', 'florianopolis',     'FLO', 'FLN', 'short', false, 40),
  ('PUJ', 'punta-cana',        'PUJ', 'PUJ', 'long',  false, 50),
  ('CUN', 'cancun',            'CUN', 'CUN', 'long',  false, 60),
  ('SCL', 'santiago-de-chile', 'SCL', 'SCL', 'short', false, 70),
  ('NYC', 'nueva-york',        'NYC', 'JFK', 'long',  false, 80),
  ('BCN', 'barcelona',         'BCN', 'BCN', 'long',  false, 90),
  ('ROE', 'roma',              'ROE', 'FCO', 'long',  false, 100),
  ('MCO', 'orlando',           'MCO', 'MCO', 'long',  false, 110)
ON CONFLICT (code) DO NOTHING;

-- Rutas: una fila BUE por destino. stay_nights según haul (long → 7/10/14,
-- short → 4/7). Arranca activa solo (MIA, BUE).
INSERT INTO flight_landing_routes (destination_code, origin_tc_code, origin_name, stay_nights, probes_per_month, active) VALUES
  ('MIA', 'BUE', 'Buenos Aires', '{7,10,14}', 8, true),
  ('MAD', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('RIO', 'BUE', 'Buenos Aires', '{4,7}',     8, false),
  ('FLO', 'BUE', 'Buenos Aires', '{4,7}',     8, false),
  ('PUJ', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('CUN', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('SCL', 'BUE', 'Buenos Aires', '{4,7}',     8, false),
  ('NYC', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('BCN', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('ROE', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false),
  ('MCO', 'BUE', 'Buenos Aires', '{7,10,14}', 8, false)
ON CONFLICT (destination_code, origin_tc_code) DO NOTHING;

-- Rutas del interior (Córdoba, Rosario, Mendoza) solo para los destinos de
-- mayor volumen. stay_nights sigue el mismo criterio por haul que la fila
-- de BUE de cada destino; probes_per_month más bajo (freno look-to-book).
INSERT INTO flight_landing_routes (destination_code, origin_tc_code, origin_name, stay_nights, probes_per_month, active) VALUES
  ('MIA', 'CRD', 'Córdoba', '{7,10,14}', 4, false),
  ('MIA', 'RO6', 'Rosario', '{7,10,14}', 4, false),
  ('MIA', 'MEZ', 'Mendoza', '{7,10,14}', 4, false),
  ('MAD', 'CRD', 'Córdoba', '{7,10,14}', 4, false),
  ('MAD', 'RO6', 'Rosario', '{7,10,14}', 4, false),
  ('MAD', 'MEZ', 'Mendoza', '{7,10,14}', 4, false),
  ('RIO', 'CRD', 'Córdoba', '{4,7}',     4, false),
  ('RIO', 'RO6', 'Rosario', '{4,7}',     4, false),
  ('RIO', 'MEZ', 'Mendoza', '{4,7}',     4, false),
  ('PUJ', 'CRD', 'Córdoba', '{7,10,14}', 4, false),
  ('PUJ', 'RO6', 'Rosario', '{7,10,14}', 4, false),
  ('PUJ', 'MEZ', 'Mendoza', '{7,10,14}', 4, false),
  ('CUN', 'CRD', 'Córdoba', '{7,10,14}', 4, false),
  ('CUN', 'RO6', 'Rosario', '{7,10,14}', 4, false),
  ('CUN', 'MEZ', 'Mendoza', '{7,10,14}', 4, false),
  ('SCL', 'CRD', 'Córdoba', '{4,7}',     4, false),
  ('SCL', 'RO6', 'Rosario', '{4,7}',     4, false),
  ('SCL', 'MEZ', 'Mendoza', '{4,7}',     4, false)
ON CONFLICT (destination_code, origin_tc_code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. Kill switch y presupuesto del barrido
-- ----------------------------------------------------------------------------
INSERT INTO system_flags (key, enabled, reason) VALUES ('automation.flights_sweep', TRUE, 'Barrido nocturno de tarifas para vuelos.siviajo.com') ON CONFLICT (key) DO NOTHING;
INSERT INTO provider_budgets (provider, daily_cap, monthly_cap) VALUES ('cotizador_probe', 2500, 50000) ON CONFLICT (provider) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 7. RLS: lectura para usuarios logueados; las páginas públicas leen con
--    service role, sin policy para anon.
-- ----------------------------------------------------------------------------
ALTER TABLE flight_landing_destinations ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_landing_routes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flight_landing_destinations' AND policyname = 'Authenticated users can view flight_landing_destinations'
  ) THEN
    CREATE POLICY "Authenticated users can view flight_landing_destinations"
      ON flight_landing_destinations FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'flight_landing_routes' AND policyname = 'Authenticated users can view flight_landing_routes'
  ) THEN
    CREATE POLICY "Authenticated users can view flight_landing_routes"
      ON flight_landing_routes FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
