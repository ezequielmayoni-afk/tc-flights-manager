-- Fase 7d: recordatorio del plazo a aéreos. 2026-10-17. Idempotente.
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS risk_evaluated_at TIMESTAMPTZ;
