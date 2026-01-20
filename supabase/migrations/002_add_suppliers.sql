-- Migration: Add suppliers table and convert supplier_code to FK
-- Run this in your Supabase SQL Editor

-- =====================================================
-- SUPPLIERS TABLE
-- =====================================================
CREATE TABLE suppliers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert suppliers data
INSERT INTO suppliers (id, name) VALUES
  (18259, 'Sí, viajo'),
  (19621, 'Intermac'),
  (19657, 'TopDest'),
  (19660, 'Euro Vips'),
  (22036, 'Tower Travel'),
  (23246, 'Tucano'),
  (23315, 'Havanatur');

-- =====================================================
-- MIGRATE FLIGHTS TABLE
-- =====================================================

-- Add new supplier_id column
ALTER TABLE flights ADD COLUMN supplier_id INTEGER REFERENCES suppliers(id);

-- Migrate existing data: 'siviajo' -> 18259 (Sí, viajo)
UPDATE flights SET supplier_id = 18259 WHERE supplier_code = 'siviajo' OR supplier_code IS NULL;

-- Set default for new flights
ALTER TABLE flights ALTER COLUMN supplier_id SET DEFAULT 18259;

-- Make supplier_id NOT NULL after migration
ALTER TABLE flights ALTER COLUMN supplier_id SET NOT NULL;

-- Drop old supplier_code column
ALTER TABLE flights DROP COLUMN supplier_code;

-- Create index for faster lookups
CREATE INDEX idx_flights_supplier_id ON flights(supplier_id);

-- =====================================================
-- RLS for suppliers (read-only for authenticated users)
-- =====================================================
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view suppliers" ON suppliers
  FOR SELECT USING (auth.uid() IS NOT NULL);
