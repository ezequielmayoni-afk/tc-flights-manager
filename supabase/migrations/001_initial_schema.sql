-- TC Flights Manager - Initial Schema
-- Run this in your Supabase SQL Editor

-- =====================================================
-- PROFILES (extends Supabase Auth users)
-- =====================================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  role TEXT DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =====================================================
-- FLIGHTS (main table)
-- =====================================================
CREATE TABLE flights (
  id SERIAL PRIMARY KEY,
  supplier_code TEXT DEFAULT 'siviajo',
  base_id TEXT NOT NULL,
  tc_transport_id TEXT,
  name TEXT NOT NULL,
  airline_code TEXT NOT NULL,
  transport_type TEXT DEFAULT 'PLANE',
  active BOOLEAN DEFAULT true,
  price_per_pax BOOLEAN DEFAULT true,
  currency TEXT DEFAULT 'USD',

  -- Precios OW (One Way)
  base_adult_price DECIMAL(10,2) DEFAULT 0,
  base_children_price DECIMAL(10,2) DEFAULT 0,
  base_infant_price DECIMAL(10,2) DEFAULT 0,

  -- Precios RT (Round Trip)
  base_adult_rt_price DECIMAL(10,2) DEFAULT 0,
  base_children_rt_price DECIMAL(10,2) DEFAULT 0,
  base_infant_rt_price DECIMAL(10,2) DEFAULT 0,

  -- Impuestos OW
  adult_taxes_amount DECIMAL(10,2) DEFAULT 0,
  children_taxes_amount DECIMAL(10,2) DEFAULT 0,
  infant_taxes_amount DECIMAL(10,2) DEFAULT 0,

  -- Impuestos RT
  adult_rt_taxes_amount DECIMAL(10,2) DEFAULT 0,
  children_rt_taxes_amount DECIMAL(10,2) DEFAULT 0,
  infant_rt_taxes_amount DECIMAL(10,2) DEFAULT 0,

  -- Fechas y configuración
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  release_contract INTEGER DEFAULT 0,
  operational_days TEXT[] DEFAULT '{}',
  option_codes TEXT[] DEFAULT '{}',
  only_holiday_package BOOLEAN DEFAULT false,
  show_in_transport_quotas_landing BOOLEAN DEFAULT false,

  -- Edades
  min_child_age INTEGER DEFAULT 2,
  max_child_age INTEGER DEFAULT 11,
  min_infant_age INTEGER DEFAULT 0,
  max_infant_age INTEGER DEFAULT 2,

  -- Permisos de precio
  allow_ow_price BOOLEAN DEFAULT false,
  allow_rt_price BOOLEAN DEFAULT true,

  -- Tipos de producto
  product_types TEXT[] DEFAULT ARRAY['FLIGHT_HOTEL', 'MULTI'],

  -- Contratos combinables RT
  combinable_rt_contracts TEXT[] DEFAULT '{}',

  -- Metadata
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error', 'modified')),
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster lookups
CREATE INDEX idx_flights_tc_transport_id ON flights(tc_transport_id);
CREATE INDEX idx_flights_sync_status ON flights(sync_status);
CREATE INDEX idx_flights_base_id ON flights(base_id);

-- =====================================================
-- FLIGHT SEGMENTS
-- =====================================================
CREATE TABLE flight_segments (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE,
  departure_location_code TEXT NOT NULL,
  arrival_location_code TEXT NOT NULL,
  departure_time TIME NOT NULL,
  arrival_time TIME NOT NULL,
  plus_days INTEGER DEFAULT 0,
  duration_time TIME,
  model TEXT,
  num_service TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flight_segments_flight_id ON flight_segments(flight_id);

-- =====================================================
-- FLIGHT DATASHEETS (descriptions by language)
-- =====================================================
CREATE TABLE flight_datasheets (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(flight_id, language)
);

CREATE INDEX idx_flight_datasheets_flight_id ON flight_datasheets(flight_id);

-- =====================================================
-- FLIGHT CANCELLATIONS
-- =====================================================
CREATE TABLE flight_cancellations (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE,
  days INTEGER NOT NULL,
  percentage DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_flight_cancellations_flight_id ON flight_cancellations(flight_id);

-- =====================================================
-- MODALITIES
-- =====================================================
CREATE TABLE modalities (
  id SERIAL PRIMARY KEY,
  flight_id INTEGER REFERENCES flights(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  active BOOLEAN DEFAULT true,
  cabin_class_type TEXT NOT NULL,
  baggage_allowance TEXT,
  baggage_allowance_type TEXT,
  min_passengers INTEGER DEFAULT 1,
  max_passengers INTEGER DEFAULT 10,
  on_request BOOLEAN DEFAULT false,
  sync_status TEXT DEFAULT 'pending' CHECK (sync_status IN ('pending', 'synced', 'error', 'modified')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modalities_flight_id ON modalities(flight_id);

-- =====================================================
-- MODALITY INVENTORIES
-- =====================================================
CREATE TABLE modality_inventories (
  id SERIAL PRIMARY KEY,
  modality_id INTEGER REFERENCES modalities(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  quantity INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_modality_inventories_modality_id ON modality_inventories(modality_id);

-- =====================================================
-- MODALITY TRANSLATIONS
-- =====================================================
CREATE TABLE modality_translations (
  id SERIAL PRIMARY KEY,
  modality_id INTEGER REFERENCES modalities(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(modality_id, language)
);

CREATE INDEX idx_modality_translations_modality_id ON modality_translations(modality_id);

-- =====================================================
-- SYNC LOGS
-- =====================================================
CREATE TABLE sync_logs (
  id SERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  direction TEXT NOT NULL CHECK (direction IN ('push', 'pull')),
  status TEXT NOT NULL CHECK (status IN ('success', 'error')),
  request_payload JSONB,
  response_payload JSONB,
  error_message TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_logs_entity ON sync_logs(entity_type, entity_id);
CREATE INDEX idx_sync_logs_created_at ON sync_logs(created_at DESC);

-- =====================================================
-- CATALOGS (static data)
-- =====================================================

-- Airlines
CREATE TABLE airlines (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Airports
CREATE TABLE airports (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  city TEXT,
  country TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cabin Classes
CREATE TABLE cabin_classes (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- SEED DATA FOR CATALOGS
-- =====================================================

-- Cabin classes
INSERT INTO cabin_classes (code, name) VALUES
  ('ECONOMY', 'Economy'),
  ('PREMIUM_ECONOMY', 'Premium Economy'),
  ('BUSINESS', 'Business'),
  ('FIRST', 'First Class');

-- Common airlines (Argentina focus)
INSERT INTO airlines (code, name, country) VALUES
  ('AR', 'Aerolíneas Argentinas', 'Argentina'),
  ('LA', 'LATAM Airlines', 'Chile'),
  ('AA', 'American Airlines', 'USA'),
  ('UA', 'United Airlines', 'USA'),
  ('DL', 'Delta Air Lines', 'USA'),
  ('IB', 'Iberia', 'Spain'),
  ('AV', 'Avianca', 'Colombia'),
  ('CM', 'Copa Airlines', 'Panama'),
  ('AM', 'Aeromexico', 'Mexico'),
  ('G3', 'Gol Linhas Aéreas', 'Brazil'),
  ('JJ', 'LATAM Brasil', 'Brazil'),
  ('AF', 'Air France', 'France'),
  ('LH', 'Lufthansa', 'Germany'),
  ('BA', 'British Airways', 'UK'),
  ('EK', 'Emirates', 'UAE'),
  ('QR', 'Qatar Airways', 'Qatar'),
  ('TK', 'Turkish Airlines', 'Turkey');

-- Common airports (Argentina and main destinations)
INSERT INTO airports (code, name, city, country) VALUES
  -- Argentina
  ('EZE', 'Aeropuerto Internacional Ministro Pistarini', 'Buenos Aires', 'Argentina'),
  ('AEP', 'Aeroparque Jorge Newbery', 'Buenos Aires', 'Argentina'),
  ('COR', 'Aeropuerto Internacional Ingeniero Ambrosio Taravella', 'Córdoba', 'Argentina'),
  ('MDZ', 'Aeropuerto Internacional El Plumerillo', 'Mendoza', 'Argentina'),
  ('ROS', 'Aeropuerto Internacional Islas Malvinas', 'Rosario', 'Argentina'),
  ('SLA', 'Aeropuerto Internacional Martín Miguel de Güemes', 'Salta', 'Argentina'),
  ('IGR', 'Aeropuerto Internacional Cataratas del Iguazú', 'Puerto Iguazú', 'Argentina'),
  ('BRC', 'Aeropuerto Internacional Teniente Luis Candelaria', 'Bariloche', 'Argentina'),
  ('USH', 'Aeropuerto Internacional Malvinas Argentinas', 'Ushuaia', 'Argentina'),
  ('FTE', 'Aeropuerto Internacional Comandante Armando Tola', 'El Calafate', 'Argentina'),
  -- Brazil
  ('GRU', 'Aeropuerto Internacional de São Paulo-Guarulhos', 'São Paulo', 'Brazil'),
  ('GIG', 'Aeropuerto Internacional Galeão', 'Rio de Janeiro', 'Brazil'),
  ('FLN', 'Aeropuerto Internacional Hercílio Luz', 'Florianópolis', 'Brazil'),
  -- Caribbean
  ('PUJ', 'Aeropuerto Internacional de Punta Cana', 'Punta Cana', 'Dominican Republic'),
  ('CUN', 'Aeropuerto Internacional de Cancún', 'Cancún', 'Mexico'),
  ('MBJ', 'Aeropuerto Internacional Sangster', 'Montego Bay', 'Jamaica'),
  ('AUA', 'Aeropuerto Internacional Reina Beatrix', 'Oranjestad', 'Aruba'),
  ('CUR', 'Aeropuerto Internacional Hato', 'Willemstad', 'Curaçao'),
  ('SXM', 'Aeropuerto Internacional Princesa Juliana', 'Sint Maarten', 'Sint Maarten'),
  -- USA
  ('MIA', 'Aeropuerto Internacional de Miami', 'Miami', 'USA'),
  ('JFK', 'Aeropuerto Internacional John F. Kennedy', 'New York', 'USA'),
  ('EWR', 'Aeropuerto Internacional Newark Liberty', 'Newark', 'USA'),
  ('LAX', 'Aeropuerto Internacional de Los Ángeles', 'Los Angeles', 'USA'),
  ('MCO', 'Aeropuerto Internacional de Orlando', 'Orlando', 'USA'),
  ('ATL', 'Aeropuerto Internacional Hartsfield-Jackson', 'Atlanta', 'USA'),
  -- Europe
  ('MAD', 'Aeropuerto Adolfo Suárez Madrid-Barajas', 'Madrid', 'Spain'),
  ('BCN', 'Aeropuerto de Barcelona-El Prat', 'Barcelona', 'Spain'),
  ('FCO', 'Aeropuerto de Roma-Fiumicino', 'Rome', 'Italy'),
  ('CDG', 'Aeropuerto de París-Charles de Gaulle', 'Paris', 'France'),
  ('LHR', 'Aeropuerto de Londres-Heathrow', 'London', 'UK'),
  ('FRA', 'Aeropuerto de Fráncfort', 'Frankfurt', 'Germany'),
  ('AMS', 'Aeropuerto de Ámsterdam-Schiphol', 'Amsterdam', 'Netherlands'),
  ('FCO', 'Aeropuerto de Roma-Fiumicino', 'Rome', 'Italy'),
  -- Others
  ('BOG', 'Aeropuerto Internacional El Dorado', 'Bogotá', 'Colombia'),
  ('LIM', 'Aeropuerto Internacional Jorge Chávez', 'Lima', 'Peru'),
  ('SCL', 'Aeropuerto Internacional Arturo Merino Benítez', 'Santiago', 'Chile'),
  ('PTY', 'Aeropuerto Internacional de Tocumen', 'Panama City', 'Panama'),
  ('MEX', 'Aeropuerto Internacional Benito Juárez', 'Mexico City', 'Mexico');

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flights ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_segments ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_datasheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE flight_cancellations ENABLE ROW LEVEL SECURITY;
ALTER TABLE modalities ENABLE ROW LEVEL SECURITY;
ALTER TABLE modality_inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE modality_translations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;

-- Profiles: users can only see their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- Flights: authenticated users can CRUD all flights
CREATE POLICY "Authenticated users can view flights" ON flights
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert flights" ON flights
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update flights" ON flights
  FOR UPDATE USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can delete flights" ON flights
  FOR DELETE USING (auth.uid() IS NOT NULL);

-- Flight segments: follow flight permissions
CREATE POLICY "Authenticated users can manage flight_segments" ON flight_segments
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Flight datasheets: follow flight permissions
CREATE POLICY "Authenticated users can manage flight_datasheets" ON flight_datasheets
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Flight cancellations: follow flight permissions
CREATE POLICY "Authenticated users can manage flight_cancellations" ON flight_cancellations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Modalities: follow flight permissions
CREATE POLICY "Authenticated users can manage modalities" ON modalities
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Modality inventories: follow modality permissions
CREATE POLICY "Authenticated users can manage modality_inventories" ON modality_inventories
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Modality translations: follow modality permissions
CREATE POLICY "Authenticated users can manage modality_translations" ON modality_translations
  FOR ALL USING (auth.uid() IS NOT NULL);

-- Sync logs: authenticated users can view and create
CREATE POLICY "Authenticated users can view sync_logs" ON sync_logs
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert sync_logs" ON sync_logs
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- Catalogs are public (read-only for authenticated users)
-- No RLS needed as they're reference data

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_flights_updated_at
  BEFORE UPDATE ON flights
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_modalities_updated_at
  BEFORE UPDATE ON modalities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
