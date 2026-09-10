-- Perfiles creados al vuelo desde Tendencias: quedan pendientes de revisión.
ALTER TABLE destination_profiles
  ADD COLUMN IF NOT EXISTS review_pending BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_from TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;
