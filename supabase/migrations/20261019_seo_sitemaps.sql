-- Fase 14: sitemaps servidos por HUB para siviajo.com (hoteles con SEO cargado, paquetes,
-- temáticas). 2026-10-19. Idempotente.
--
-- siviajo.com (Travel Compositor) no genera sitemaps: el estático es de enero 2025 y el de
-- paquetes da 404. HUB sirve `GET /sitemaps/index.xml` y `GET /sitemaps/{archivo}.xml` leyendo
-- esta tabla; se envían a la propiedad de dominio `sc-domain:siviajo.com` por API (Google acepta
-- sitemaps en otro host del mismo dominio verificado). `scripts/seo-hotel-sitemap.ts` la llena.

CREATE TABLE IF NOT EXISTS seo_sitemap_entries (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('hotel','package','theme')),
  file TEXT NOT NULL,                     -- archivo del sitemap: 'hoteles-cancun', 'paquetes', 'tematicas'
  url TEXT NOT NULL UNIQUE,               -- URL canónica en www.siviajo.com
  code TEXT,                              -- código TC (hotel: 'master-163216'; paquete: id; temática: id)
  title TEXT,                             -- <title> visto en la página (sirve para auditar el SEO cargado)
  destination TEXT,                       -- slug del destino (hoteles)
  active BOOLEAN NOT NULL DEFAULT true,   -- false = sale del sitemap (404, sin SEO, paquete inactivo)
  lastmod DATE,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  meta JSONB
);
CREATE INDEX IF NOT EXISTS idx_seo_sitemap_entries_file ON seo_sitemap_entries (file, active);
CREATE INDEX IF NOT EXISTS idx_seo_sitemap_entries_code ON seo_sitemap_entries (kind, code);
COMMENT ON TABLE seo_sitemap_entries IS 'URLs de siviajo.com que HUB publica en /sitemaps/*.xml: hoteles con SEO cargado (detectado en la página pública), paquetes propios activos y temáticas.';

ALTER TABLE seo_sitemap_entries ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'seo_sitemap_entries' AND policyname = 'Authenticated users can view seo_sitemap_entries') THEN
    CREATE POLICY "Authenticated users can view seo_sitemap_entries" ON seo_sitemap_entries FOR SELECT TO authenticated USING (true);
  END IF;
END $$;
