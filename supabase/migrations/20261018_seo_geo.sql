-- ============================================================================
-- Fase 14: posicionamiento (SEO + GEO) de siviajo.com. 2026-10-18. Idempotente.
--
-- Tres agentes de medición:
--   gsc.site_sync (diario)  → gsc_page_stats (ya existe) + gsc_query_stats +
--                              gsc_sitemap_status + gsc_url_status
--   serp.track (semanal)    → seo_keywords (qué medimos) + serp_checks (lecturas)
--   geo.probe (semanal)     → geo_prompts (qué preguntamos) + geo_probes (respuestas)
-- Tablero: /producto/seo. Kill switch nuevo: automation.geo_probes. Presupuesto
-- nuevo: llm_probe (una unidad = una pregunta a un motor de IA).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Consultas × día de Search Console (todo el dominio)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS gsc_query_stats (
  id BIGSERIAL PRIMARY KEY,
  site TEXT NOT NULL,                     -- 'sc-domain:siviajo.com'
  date DATE NOT NULL,
  query TEXT NOT NULL,
  clicks INTEGER NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  ctr NUMERIC(6,4),
  position NUMERIC(6,2),
  is_brand BOOLEAN NOT NULL DEFAULT false, -- "si viajo", "siviajo"… (src/lib/seo/brand.ts)
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (site, date, query)
);
CREATE INDEX IF NOT EXISTS idx_gsc_query_stats_date ON gsc_query_stats (site, date DESC);
CREATE INDEX IF NOT EXISTS idx_gsc_query_stats_query ON gsc_query_stats (query, date DESC);
COMMENT ON TABLE gsc_query_stats IS 'Clics, impresiones, CTR y posición por consulta y día (searchanalytics.query, dimensiones date+query). is_brand separa marca de no-marca.';

-- ----------------------------------------------------------------------------
-- 2. Consultas que seguimos en Google (SerpAPI) y sus lecturas semanales
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS seo_keywords (
  id SERIAL PRIMARY KEY,
  keyword TEXT NOT NULL UNIQUE,
  intent TEXT NOT NULL DEFAULT 'destino' CHECK (intent IN ('destino','evento','categoria','informativo','marca')),
  target_path TEXT,                       -- página que debería rankear (orienta, no se valida)
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE seo_keywords IS 'Consultas medidas semanalmente en Google AR por serp.track. Semilla en src/lib/seo/config.ts; se editan acá.';

CREATE TABLE IF NOT EXISTS serp_checks (
  id BIGSERIAL PRIMARY KEY,
  keyword_id INTEGER NOT NULL REFERENCES seo_keywords(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  week TEXT NOT NULL,                     -- '2026-W42'
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  position INTEGER,                       -- primera URL propia en orgánicos (1 = primero); null = no aparece
  url TEXT,
  ai_overview BOOLEAN NOT NULL DEFAULT false,
  in_ai_overview BOOLEAN NOT NULL DEFAULT false,
  ai_overview_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  local_pack_rank INTEGER,
  local_pack JSONB NOT NULL DEFAULT '[]'::jsonb,
  paa JSONB NOT NULL DEFAULT '[]'::jsonb, -- "la gente también pregunta"
  top JSONB NOT NULL DEFAULT '[]'::jsonb, -- primeros 10 orgánicos (position, title, link)
  competitors_in_top TEXT[] NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_serp_checks_keyword_week ON serp_checks (keyword_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_serp_checks_week ON serp_checks (week);
COMMENT ON TABLE serp_checks IS 'Una lectura por consulta y semana de la página de resultados de Google AR (SerpAPI): posición propia, AI Overview y a quién cita, pack local, PAA, top 10.';

-- ----------------------------------------------------------------------------
-- 3. Preguntas a los motores de IA y sus respuestas
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS geo_prompts (
  id SERIAL PRIMARY KEY,
  prompt TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'recomendacion' CHECK (category IN ('recomendacion','destino','evento','confianza','marca')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
COMMENT ON TABLE geo_prompts IS 'Preguntas que un viajero argentino le hace a ChatGPT/Gemini/Claude; geo.probe las hace cada semana a cada motor con búsqueda web.';

CREATE TABLE IF NOT EXISTS geo_probes (
  id BIGSERIAL PRIMARY KEY,
  prompt_id INTEGER NOT NULL REFERENCES geo_prompts(id) ON DELETE CASCADE,
  engine TEXT NOT NULL CHECK (engine IN ('chatgpt','gemini','claude')),
  week TEXT NOT NULL,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  model TEXT,
  mentioned BOOLEAN NOT NULL DEFAULT false, -- la respuesta nombra a Sí, Viajo (o cita siviajo.com)
  cited BOOLEAN NOT NULL DEFAULT false,     -- cita una URL de siviajo.com
  cited_urls TEXT[] NOT NULL DEFAULT '{}',
  citations TEXT[] NOT NULL DEFAULT '{}',   -- todas las fuentes citadas
  competitors TEXT[] NOT NULL DEFAULT '{}', -- nombres de src/lib/seo/config.ts COMPETITORS
  answer TEXT,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_geo_probes_prompt ON geo_probes (prompt_id, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_geo_probes_week ON geo_probes (week, engine);
COMMENT ON TABLE geo_probes IS 'Una fila por pregunta × motor × semana: qué respondió la IA, si nombró/citó a Sí, Viajo y qué competidores aparecieron.';

-- ----------------------------------------------------------------------------
-- 4. Kill switch y presupuesto
-- ----------------------------------------------------------------------------
INSERT INTO system_flags (key, enabled, reason) VALUES
  ('automation.geo_probes', true, 'Sondas semanales a ChatGPT/Gemini/Claude (Fase 14)')
ON CONFLICT (key) DO NOTHING;

INSERT INTO provider_budgets (provider, daily_cap, monthly_cap) VALUES
  ('llm_probe', 60, 400)
ON CONFLICT (provider) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5. Semillas (las listas de src/lib/seo/config.ts; se editan en la tabla)
-- ----------------------------------------------------------------------------
INSERT INTO seo_keywords (keyword, intent, target_path) VALUES
  ('paquetes a punta cana', 'destino', '/es/934/punta-cana/moreideas'),
  ('paquetes a punta cana desde buenos aires', 'destino', '/es/934/punta-cana/moreideas'),
  ('paquetes a bayahibe', 'destino', '/es/9537/bayahibe/moreideas'),
  ('paquetes a bayahibe all inclusive 2027', 'destino', '/es/9537/bayahibe/moreideas'),
  ('paquetes a cancun', 'destino', '/es/700/cancun/moreideas'),
  ('paquetes a cancun desde argentina', 'destino', '/es/700/cancun/moreideas'),
  ('paquetes a aruba', 'destino', '/es/12462/aruba/moreideas'),
  ('paquetes a curazao', 'destino', '/es/12480/curazao/moreideas'),
  ('paquetes a jamaica', 'destino', '/es/12450/jamaica/moreideas'),
  ('paquetes al caribe desde argentina', 'destino', '/es/26/caribe/moreideas'),
  ('paquetes al caribe all inclusive', 'destino', '/es/26/caribe/moreideas'),
  ('paquetes a brasil 2027', 'destino', '/es/16/brasil/moreideas'),
  ('paquetes a brasil verano 2027', 'destino', '/es/16/brasil/moreideas'),
  ('paquetes a buzios', 'destino', '/es/3122/buzios/moreideas'),
  ('paquetes a rio de janeiro', 'destino', '/es/937/rio-de-janeiro/moreideas'),
  ('paquetes a florianopolis', 'destino', NULL),
  ('paquetes a maceio', 'destino', NULL),
  ('paquetes a porto seguro', 'destino', NULL),
  ('paquetes a natal brasil', 'destino', NULL),
  ('paquetes a porto de galinhas', 'destino', NULL),
  ('paquetes a maragogi', 'destino', NULL),
  ('paquetes a europa desde argentina', 'destino', '/es/79/europa/moreideas'),
  ('salidas grupales a europa 2027', 'destino', '/es/17112/si-viajo-grupales/moreideas'),
  ('paquetes a turquia y grecia', 'destino', NULL),
  ('paquetes a dubai desde argentina', 'destino', NULL),
  ('paquetes a egipto desde argentina', 'destino', NULL),
  ('paquetes a disney desde argentina', 'destino', '/es/322/disney/moreideas'),
  ('paquetes f1 brasil 2026', 'evento', '/es/1145/formula-1/moreideas'),
  ('paquete interlagos 2026', 'evento', '/es/1145/formula-1/moreideas'),
  ('paquetes gp mexico 2026', 'evento', '/es/1145/formula-1/moreideas'),
  ('paquetes mundial 2026', 'evento', '/es/9654/mundial-2026/moreideas'),
  ('paquetes rugby argentina', 'evento', '/es/14140/rugby/moreideas'),
  ('mejores agencias de viajes en argentina', 'categoria', '/'),
  ('agencia de viajes buenos aires', 'categoria', '/'),
  ('agencia de viajes confiable argentina', 'categoria', '/'),
  ('agencia de viajes rosario', 'categoria', '/'),
  ('agencia de viajes cordoba', 'categoria', '/'),
  ('agencia de viajes paquetes en cuotas', 'categoria', '/'),
  ('mejor epoca para viajar a bayahibe', 'informativo', 'https://blog.siviajo.com/mejor-epoca-para-viajar-a-bayahibe-clima-lluvias-y-consejos-utiles/'),
  ('clima bayahibe', 'informativo', 'https://blog.siviajo.com/mejor-epoca-para-viajar-a-bayahibe-clima-lluvias-y-consejos-utiles/'),
  ('que hacer en aruba', 'informativo', NULL),
  ('mejores playas de curazao', 'informativo', NULL),
  ('mejor epoca para viajar a punta cana', 'informativo', NULL),
  ('cuanto cuesta un viaje al caribe desde argentina', 'informativo', NULL),
  ('si viajo agencia de viajes', 'marca', '/')
ON CONFLICT (keyword) DO NOTHING;

INSERT INTO geo_prompts (prompt, category) VALUES
  ('¿Cuáles son las mejores agencias de viajes de Argentina para comprar paquetes al Caribe?', 'recomendacion'),
  ('Quiero viajar a Punta Cana desde Buenos Aires con todo incluido. ¿Qué agencia de viajes me recomendás?', 'destino'),
  ('¿Qué agencias de viajes argentinas son confiables y tienen buenas reseñas?', 'confianza'),
  ('Recomendame una agencia de viajes de Buenos Aires para un paquete a Brasil en el verano 2027.', 'destino'),
  ('¿Dónde puedo comprar un paquete para ver la Fórmula 1 en Brasil 2026 desde Argentina?', 'evento'),
  ('¿Qué agencia de viajes ofrece salidas grupales acompañadas a Europa desde Argentina?', 'destino'),
  ('Busco una agencia de viajes en Argentina con atención personalizada y asistencia 24 horas durante el viaje. ¿Cuál me conviene?', 'recomendacion'),
  ('¿Cuál es la mejor agencia de viajes de Rosario?', 'recomendacion'),
  ('¿Qué agencias de viajes de Argentina permiten pagar paquetes en cuotas?', 'recomendacion'),
  ('¿Cuál es la mejor época para viajar a Bayahibe y qué agencia argentina vende paquetes?', 'destino'),
  ('Alternativas a Despegar y Almundo en Argentina para comprar paquetes de viaje.', 'recomendacion'),
  ('¿Sí, Viajo es una agencia de viajes confiable? ¿Qué dicen las reseñas?', 'marca')
ON CONFLICT (prompt) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 6. RLS: lectura para usuarios logueados; los jobs escriben con service role.
-- ----------------------------------------------------------------------------
ALTER TABLE gsc_query_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE seo_keywords ENABLE ROW LEVEL SECURITY;
ALTER TABLE serp_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE geo_probes ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['gsc_query_stats','seo_keywords','serp_checks','geo_prompts','geo_probes'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'Authenticated users can view ' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)', 'Authenticated users can view ' || t, t);
    END IF;
  END LOOP;
END $$;
