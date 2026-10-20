-- Fase 14: títulos con la temporada desfasada respecto de la salida cargada en TC.
-- 2026-10-20. Idempotente.
--
-- La URL es el producto: cuando se corre la salida, el id no cambia pero el título
-- ("– Temporada baja 2026"), el H1 y los meta tags tienen que seguir a la fecha nueva.
-- El job diario `seo.title_drift` compara la etiqueta del título con la temporada que
-- corresponde a la salida de hoy (regla por destino de src/lib/seo/titles.ts), guarda
-- la propuesta acá, aplica título y H1 por API si el flag `automation.seo_title_autoapply`
-- está prendido, y avisa por Slack y en /tareas. Los meta tags van por el backoffice.

CREATE TABLE IF NOT EXISTS seo_title_drift (
  id BIGSERIAL PRIMARY KEY,
  tc_package_id INTEGER NOT NULL,
  url TEXT,
  grupo TEXT,                              -- caribe | brasil | argentina | europa | exotico | orlando
  departure_date DATE,
  date_range_end DATE,
  title_before TEXT NOT NULL,
  title_expected TEXT NOT NULL,
  meta_title_before TEXT,
  meta_title_expected TEXT,                -- null = el meta no menciona la temporada vieja: revisar a mano
  meta_desc_before TEXT,
  meta_desc_expected TEXT,
  impressions_28d INTEGER NOT NULL DEFAULT 0,
  clicks_28d INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','title_applied','done','dismissed')),
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  title_applied_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  note TEXT,
  UNIQUE (tc_package_id, title_expected)
);
CREATE INDEX IF NOT EXISTS idx_seo_title_drift_status ON seo_title_drift (status, detected_at DESC);
COMMENT ON TABLE seo_title_drift IS 'Fichas cuyo título dice una temporada distinta de la que corresponde a la salida cargada en TC; propuesta de título y meta nuevos.';

ALTER TABLE seo_title_drift ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'seo_title_drift' AND policyname = 'Authenticated users can view seo_title_drift') THEN
    CREATE POLICY "Authenticated users can view seo_title_drift" ON seo_title_drift FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
GRANT ALL ON TABLE public.seo_title_drift TO service_role;
GRANT SELECT ON TABLE public.seo_title_drift TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE public.seo_title_drift_id_seq TO service_role, authenticated;

-- Apagado al principio: el job sólo propone. Prenderlo = cambia título y H1 por API solo.
INSERT INTO system_flags (key, enabled, reason) VALUES
  ('automation.seo_title_autoapply', false, 'Aplicar solo el título/H1 cuando la temporada del título queda desfasada (Fase 14)')
ON CONFLICT (key) DO NOTHING;
