-- Gift cards: tipo de cambio y coeficientes por cuotas editables desde HUB (2026-10-27). Idempotente.
-- Pedido de Ezequiel: "1000 puntos en 1 pago son 1.590.000 porque puse tipo de cambio 1590; en 6 cuotas,
-- 6 cuotas de X porque le puse un coeficiente X en la configuración". fx_rate NULL = usar la cotización
-- manual de TC. plans = [{n, coef, enabled}]: total en n cuotas = contado × coef (1 pago siempre coef 1).
CREATE TABLE IF NOT EXISTS giftcard_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  fx_rate NUMERIC(12,4),
  plans JSONB NOT NULL DEFAULT '[{"n":1,"coef":1,"enabled":true},{"n":3,"coef":1,"enabled":true},{"n":6,"coef":1,"enabled":true},{"n":9,"coef":1,"enabled":true},{"n":12,"coef":1,"enabled":true}]'::jsonb,
  note TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by TEXT
);
INSERT INTO giftcard_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
-- En el pedido guardamos el contado y el coeficiente aplicado; amount_ars pasa a ser el total cobrado (con cuotas).
ALTER TABLE giftcard_orders ADD COLUMN IF NOT EXISTS cash_ars NUMERIC(14,2);
ALTER TABLE giftcard_orders ADD COLUMN IF NOT EXISTS coef NUMERIC(8,4);
