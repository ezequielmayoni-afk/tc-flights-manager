-- Fase 7b: contactos de aerolíneas y casilla de envío del pedido de cupos. 2026-10-17. Idempotente.

CREATE TABLE IF NOT EXISTS airline_contacts (
  id SERIAL PRIMARY KEY,
  airline_code TEXT NOT NULL,          -- código IATA (JA, DM, AV, LA…) o '*' para un consolidador que cotiza todo
  airline_name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT NOT NULL,
  cc_emails TEXT[] NOT NULL DEFAULT '{}',
  phone TEXT,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_airline_contacts_code ON airline_contacts (airline_code) WHERE active;
ALTER TABLE airline_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS airline_contacts_read ON airline_contacts;
CREATE POLICY airline_contacts_read ON airline_contacts FOR SELECT TO authenticated USING (true);

-- Casilla desde la que sale el pedido (el agente de mail la usa cuando esté habilitada).
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_from TEXT;
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_from_name TEXT DEFAULT 'Sí, viajo · Cupos';
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_cc TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_subject_prefix TEXT DEFAULT 'Pedido de cupos Sí, viajo';
ALTER TABLE notification_settings ADD COLUMN IF NOT EXISTS cupo_mail_signature TEXT;

-- A quién se le mandó (o se le mandaría) cada pedido.
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS sent_to TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS mail_thread_id TEXT;
ALTER TABLE cupo_requests ADD COLUMN IF NOT EXISTS mail_message_id TEXT;
