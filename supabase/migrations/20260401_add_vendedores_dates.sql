-- Store start/end dates for vendedores (not available in Google Sheets)
CREATE TABLE IF NOT EXISTS vendedor_dates (
  id SERIAL PRIMARY KEY,
  nombre TEXT UNIQUE NOT NULL,
  fecha_alta DATE,
  fecha_baja DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
