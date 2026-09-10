-- ============================================================================
-- Search Console de vuelos.siviajo.com (sitemap, indexación, clics)
--
-- El job diario `gsc.vuelos_sync` reenvía el sitemap de la landing, trae
-- clics/impresiones por página y pregunta URL por URL si Google las indexó.
-- Estas tres tablas son la copia local de esas respuestas: la landing y el
-- admin leen de acá, nunca de la API (100 llamadas/día de cuota).
--
-- La propiedad es de DOMINIO (`sc-domain:siviajo.com`), así que la columna
-- `site` es la misma para todas las filas hoy; queda explícita por si algún
-- día se agrega otra propiedad.
--
-- Esta migración solo crea el esquema: no se aplica a producción acá (lo
-- aplica el controlador). Todo IF NOT EXISTS, idempotente.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Rendimiento por página y día (searchanalytics.query)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gsc_page_stats (
  id BIGSERIAL PRIMARY KEY,
  site TEXT NOT NULL,                     -- 'sc-domain:siviajo.com'
  date DATE NOT NULL,                     -- día del dato (Search Console publica con ~2 días de retraso)
  page TEXT NOT NULL,                     -- URL completa
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4),                       -- 0–1, como lo devuelve la API
  position NUMERIC(6,2),                  -- posición media del día
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- El job pisa el día que Google todavía estaba consolidando.
  UNIQUE (site, date, page)
);

CREATE INDEX IF NOT EXISTS idx_gsc_page_stats_page_date ON gsc_page_stats (page, date DESC);

COMMENT ON TABLE gsc_page_stats IS
  'Clics, impresiones, CTR y posición por página y día, de searchanalytics.query. Upsert por (site, date, page): el dato definitivo pisa al provisorio.';

-- ----------------------------------------------------------------------------
-- 2. Estado de indexación por URL (urlInspection.index.inspect)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gsc_url_status (
  url TEXT PRIMARY KEY,
  site TEXT NOT NULL,
  verdict TEXT,                           -- PASS = indexada; NEUTRAL = Google no la conoce; FAIL = excluida
  coverage_state TEXT,                    -- texto libre y localizado ('Submitted and indexed')
  indexing_state TEXT,                    -- INDEXING_ALLOWED, BLOCKED_BY_META_TAG, …
  last_crawl_time TIMESTAMPTZ,
  google_canonical TEXT,
  robots_txt_state TEXT,
  raw JSONB,                              -- inspectionResult completo (campos que todavía no modelamos)
  inspected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE gsc_url_status IS
  'Última inspección de cada URL de la landing. Interesa el estado actual, no la serie: el job upsertea por URL.';

-- ----------------------------------------------------------------------------
-- 3. Estado del sitemap (sitemaps.get)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gsc_sitemap_status (
  feedpath TEXT PRIMARY KEY,              -- https://vuelos.siviajo.com/sitemap.xml
  site TEXT NOT NULL,
  last_submitted TIMESTAMPTZ,
  last_downloaded TIMESTAMPTZ,            -- null mientras Google no lo haya leído
  is_pending BOOLEAN,
  errors INTEGER,
  warnings INTEGER,
  submitted_urls INTEGER,                 -- suma de contents[].submitted
  indexed_urls INTEGER,                   -- suma de contents[].indexed
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE gsc_sitemap_status IS
  'Cómo ve Google el sitemap de la landing. El envío es idempotente: el job lo reenvía todos los días y guarda acá el estado que devuelve sitemaps.get.';

-- ----------------------------------------------------------------------------
-- 4. RLS: lectura para usuarios logueados; el job escribe con service role.
--    (El kill switch `automation.gsc_writes` y el presupuesto `gsc` ya están
--     sembrados en 20260910_automation_kernel.sql: 100 llamadas/día.)
-- ----------------------------------------------------------------------------
ALTER TABLE gsc_page_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_url_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE gsc_sitemap_status ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gsc_page_stats' AND policyname = 'Authenticated users can view gsc_page_stats'
  ) THEN
    CREATE POLICY "Authenticated users can view gsc_page_stats"
      ON gsc_page_stats FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gsc_url_status' AND policyname = 'Authenticated users can view gsc_url_status'
  ) THEN
    CREATE POLICY "Authenticated users can view gsc_url_status"
      ON gsc_url_status FOR SELECT TO authenticated USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'gsc_sitemap_status' AND policyname = 'Authenticated users can view gsc_sitemap_status'
  ) THEN
    CREATE POLICY "Authenticated users can view gsc_sitemap_status"
      ON gsc_sitemap_status FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
