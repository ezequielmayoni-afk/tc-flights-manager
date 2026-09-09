-- Fase 1 — Tendencias mide sólo demanda de mercado y con más fuentes.
-- Las columnas signal_* fijas quedan por compatibilidad; los scores por
-- fuente van en un JSONB y lo que se busca / de lo que se habla, por corrida.

ALTER TABLE trend_destinations
  ADD COLUMN IF NOT EXISTS signals JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN trend_destinations.signals IS
  'Score normalizado 0–100 por fuente: google_trends, google_related, autocomplete, youtube, trending_now';

ALTER TABLE trend_runs
  ADD COLUMN IF NOT EXISTS buzz JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN trend_runs.buzz IS
  'Qué se busca y de qué se habla en la semana: trendingNow (Google Trends AR), related (consultas relacionadas de términos genéricos), youtube';
