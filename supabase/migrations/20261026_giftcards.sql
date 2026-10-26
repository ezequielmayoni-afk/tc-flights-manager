-- Gift cards Sí, Viajo (2026-10-26). Idempotente.
-- Pedido: landing en TC (/es/landing/{id}/giftcard) + widget inyectado por GTM que cobra con
-- Mercado Pago (Checkout Pro, cuotas elegidas en la landing) y emite un voucher que es un
-- código de promoción de TC (monto fijo en USD, 1 uso, 12 meses) enviado por email.
CREATE TABLE IF NOT EXISTS giftcard_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','issued','failed','expired','cancelled','rejected')),
  amount_usd NUMERIC(10,2) NOT NULL,
  amount_ars NUMERIC(14,2) NOT NULL,
  fx_rate NUMERIC(12,6) NOT NULL,
  installments INTEGER NOT NULL DEFAULT 1,
  buyer_name TEXT NOT NULL,
  buyer_lastname TEXT NOT NULL,
  buyer_email TEXT NOT NULL,
  buyer_phone TEXT,
  buyer_document TEXT,
  recipient_name TEXT,
  message TEXT,
  mp_preference_id TEXT,
  mp_init_point TEXT,
  mp_payment_id TEXT,
  mp_status TEXT,
  mp_status_detail TEXT,
  mp_paid_amount NUMERIC(14,2),
  mp_installments INTEGER,
  code TEXT UNIQUE,
  tc_promocode_id INTEGER,
  valid_until DATE,
  voucher_sent_at TIMESTAMPTZ,
  issue_error TEXT,
  source JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS giftcard_orders_status_idx ON giftcard_orders (status, created_at);
CREATE INDEX IF NOT EXISTS giftcard_orders_mp_payment_idx ON giftcard_orders (mp_payment_id);
CREATE INDEX IF NOT EXISTS giftcard_orders_email_idx ON giftcard_orders (buyer_email);
