-- Fase 14: aviso cuando una ficha de paquete con tráfico orgánico vence (Slack + /tareas).
-- 2026-10-19. Idempotente.
--
-- TC no redirige: desactivar una ficha con impresiones es un 404 y se pierde todo lo ganado.
-- El job diario `seo.expiring` cruza los paquetes propios activos con las impresiones de
-- Search Console (28 días) y avisa cuando la última salida vence en ≤ 7 días o ya venció.
-- Una fila por (paquete, salida): el aviso no se repite hasta que cambie la fecha.

CREATE TABLE IF NOT EXISTS seo_expiring_alerts (
  id BIGSERIAL PRIMARY KEY,
  tc_package_id INTEGER NOT NULL,
  package_id INTEGER,                      -- packages.id en HUB (si está importado)
  title TEXT,
  url TEXT,
  departure_date DATE NOT NULL,
  impressions_28d INTEGER NOT NULL DEFAULT 0,
  clicks_28d INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  alerted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT,
  UNIQUE (tc_package_id, departure_date)
);
CREATE INDEX IF NOT EXISTS idx_seo_expiring_alerts_status ON seo_expiring_alerts (status, departure_date);
COMMENT ON TABLE seo_expiring_alerts IS 'Fichas con tráfico orgánico cuya salida vence: hay que cargarles la próxima salida o pasarlas a sistema, nunca desactivarlas.';

ALTER TABLE seo_expiring_alerts ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'seo_expiring_alerts' AND policyname = 'Authenticated users can view seo_expiring_alerts') THEN
    CREATE POLICY "Authenticated users can view seo_expiring_alerts" ON seo_expiring_alerts FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
GRANT ALL ON TABLE public.seo_expiring_alerts TO service_role;
GRANT SELECT ON TABLE public.seo_expiring_alerts TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.seo_expiring_alerts_id_seq TO service_role, authenticated;
