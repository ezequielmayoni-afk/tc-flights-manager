-- Fase 7c: condiciones comerciales de las tiradas (pagos, vencimientos, release) y respuestas de aéreos. 2026-10-17. Idempotente.
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS seats_offered INTEGER;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS deposit_pct NUMERIC;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS deposit_amount_pp NUMERIC;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS deposit_due_date DATE;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS balance_due_date DATE;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS release_date DATE;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS name_list_due_date DATE;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS valid_until DATE;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS cancellation_terms TEXT;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS payment_conditions TEXT;
ALTER TABLE cupo_request_options ADD COLUMN IF NOT EXISTS reply_id INTEGER;

CREATE TABLE IF NOT EXISTS cupo_request_replies (
  id SERIAL PRIMARY KEY,
  request_id INTEGER NOT NULL REFERENCES cupo_requests(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'paste' CHECK (source IN ('paste','mail')),
  from_email TEXT,
  subject TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw_text TEXT NOT NULL,
  attachments JSONB,
  parsed JSONB,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'parsed' CHECK (status IN ('parsed','applied','rejected','failed')),
  error TEXT,
  applied_at TIMESTAMPTZ,
  applied_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cupo_request_replies_request ON cupo_request_replies (request_id, created_at DESC);
ALTER TABLE cupo_request_replies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cupo_request_replies_read ON cupo_request_replies;
CREATE POLICY cupo_request_replies_read ON cupo_request_replies FOR SELECT TO authenticated USING (true);

ALTER TABLE flights ADD COLUMN IF NOT EXISTS balance_due_date DATE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS name_list_due_date DATE;
ALTER TABLE flights ADD COLUMN IF NOT EXISTS payment_conditions TEXT;
