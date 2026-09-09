-- Kernel de automatización: cola de jobs en Postgres, locks, kill switches,
-- modos por módulo, presupuesto por proveedor y salud de integraciones.
--
-- Por qué una cola en Postgres y no Redis/BullMQ: HUB corre en un VPS chico
-- bajo PM2 y el volumen es de decenas de jobs por día. Una tabla con
-- FOR UPDATE SKIP LOCKED, drenada por /api/cron/jobs-tick desde el crontab,
-- alcanza, se depura con SQL y no suma un servicio más al servidor.
--
-- Toda escritura externa (TC, siviajo.com, Meta) pasa por un job persistido:
-- queda quién lo pidió, cuándo corrió, qué devolvió y cómo se verificó.

-- ── Jobs ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS hub_jobs (
  id BIGSERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  lane TEXT NOT NULL DEFAULT 'default',
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'done', 'failed', 'cancelled', 'skipped')),
  -- 5 = normal. 8 o más = disparo manual desde la UI: salta las ventanas
  -- horarias del lane (ver src/lib/jobs/lanes.ts).
  priority INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  -- Idempotencia: dos encolados con la misma clave mientras uno está
  -- pendiente o corriendo se colapsan en uno (índice parcial de abajo).
  dedupe_key TEXT,
  locked_by TEXT,
  locked_until TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  last_error TEXT,
  -- Resultado del handler. Cuando el job escribe afuera, incluye la
  -- verificación posterior (GET) para poder auditar sin ir a TC/Meta.
  result JSONB,
  entity_type TEXT,
  entity_id TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_hub_jobs_claim
  ON hub_jobs (lane, status, run_after, priority DESC, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_hub_jobs_kind_status
  ON hub_jobs (kind, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_hub_jobs_entity
  ON hub_jobs (entity_type, entity_id)
  WHERE entity_type IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_hub_jobs_dedupe_pending
  ON hub_jobs (dedupe_key)
  WHERE dedupe_key IS NOT NULL AND status IN ('queued', 'running');

-- ── Locks (por lane o por cron) ────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS job_locks (
  name TEXT PRIMARY KEY,
  locked_by TEXT,
  locked_until TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Kill switches ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS system_flags (
  key TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reason TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO system_flags (key, enabled, reason) VALUES
  ('automation.global',          TRUE,  'Interruptor general: apagado, todo job termina skipped'),
  ('automation.tc_writes',       TRUE,  'PUT a Travel Compositor (activar/ocultar/temáticas)'),
  ('automation.jsf_writes',      TRUE,  'Guardar idea / recotizar en siviajo.com vía cotizador-bot'),
  ('automation.meta_writes',     TRUE,  'Crear, pausar o activar anuncios en Meta'),
  ('automation.cotizador_calls', TRUE,  'Cotizaciones contra el cotizador-bot'),
  ('automation.serpapi_calls',   TRUE,  'Búsquedas en SerpAPI (vuelos, tendencias, competencia)'),
  ('automation.crm_reads',       TRUE,  'Lectura nocturna de la base del CRM'),
  ('automation.gsc_writes',      TRUE,  'Envío de sitemaps a Search Console')
ON CONFLICT (key) DO NOTHING;

-- ── Modo por módulo: sombra → semi → auto ─────────────────────────────────

CREATE TABLE IF NOT EXISTS automation_modes (
  module TEXT PRIMARY KEY,
  mode TEXT NOT NULL DEFAULT 'shadow' CHECK (mode IN ('shadow', 'semi', 'auto')),
  since TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  promoted_by TEXT,
  -- Métrica que justificó el último cambio (o el retroceso).
  evidence JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO automation_modes (module, mode) VALUES
  ('marketing_guard', 'shadow'),
  ('tc_hide_on_sold_out', 'shadow'),
  ('marketing_criteria', 'shadow'),
  ('idea_save', 'shadow'),
  ('meta_launch', 'semi'),
  ('ads_autopilot', 'shadow'),
  ('requote_alternatives', 'semi')
ON CONFLICT (module) DO NOTHING;

-- ── Presupuesto por proveedor ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS provider_budgets (
  provider TEXT PRIMARY KEY,
  -- En "unidades" del proveedor: búsquedas para SerpAPI, cotizaciones para el
  -- cotizador, escrituras para Meta/TC. NULL = sin tope.
  daily_cap INTEGER,
  monthly_cap INTEGER,
  alert_pct INTEGER NOT NULL DEFAULT 80,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO provider_budgets (provider, daily_cap, monthly_cap) VALUES
  ('serpapi',    120, 2500),
  ('cotizador',   60, 1200),
  ('meta_write', 200, 4000),
  ('tc_write',   200, 4000),
  ('crm',         10,  310),
  ('gsc',        100, 2000)
ON CONFLICT (provider) DO NOTHING;

CREATE TABLE IF NOT EXISTS external_calls (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,
  endpoint TEXT,
  units INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'ok',
  duration_ms INTEGER,
  job_id BIGINT REFERENCES hub_jobs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_calls_provider_day
  ON external_calls (provider, created_at DESC);

-- ── Salud de integraciones ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS integration_status (
  provider TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'unknown' CHECK (status IN ('ok', 'degraded', 'down', 'unknown')),
  checked_at TIMESTAMPTZ,
  token_expires_at TIMESTAMPTZ,
  details JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO integration_status (provider) VALUES
  ('meta'), ('tc'), ('cotizador'), ('serpapi'), ('crm'), ('slack'), ('gsc')
ON CONFLICT (provider) DO NOTHING;

-- ── RPCs ──────────────────────────────────────────────────────────────────

-- Toma hasta p_limit jobs listos del lane y los deja en running con un lease.
-- SKIP LOCKED evita que dos ticks se lleven el mismo job.
CREATE OR REPLACE FUNCTION claim_next_jobs(
  p_lane TEXT,
  p_worker TEXT,
  p_limit INTEGER DEFAULT 1,
  p_lease_seconds INTEGER DEFAULT 900,
  p_min_priority INTEGER DEFAULT 0
)
RETURNS SETOF hub_jobs AS $$
BEGIN
  RETURN QUERY
  WITH picked AS (
    SELECT id
    FROM hub_jobs
    WHERE lane = p_lane
      AND status = 'queued'
      AND run_after <= NOW()
      AND priority >= p_min_priority
    ORDER BY priority DESC, run_after ASC, created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE hub_jobs j
  SET status = 'running',
      locked_by = p_worker,
      locked_until = NOW() + make_interval(secs => p_lease_seconds),
      heartbeat_at = NOW(),
      started_at = COALESCE(j.started_at, NOW()),
      attempts = j.attempts + 1
  FROM picked
  WHERE j.id = picked.id
  RETURNING j.*;
END;
$$ LANGUAGE plpgsql;

-- Jobs en running cuyo lease venció sin heartbeat (PM2 reinició en el medio):
-- vuelven a la cola para que el próximo tick los retome.
CREATE OR REPLACE FUNCTION requeue_stale_jobs()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE hub_jobs
  SET status = 'queued',
      locked_by = NULL,
      locked_until = NULL,
      last_error = COALESCE(last_error, '') || ' [lease vencido, reencolado]'
  WHERE status = 'running'
    AND locked_until IS NOT NULL
    AND locked_until < NOW();
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Lock con TTL. Devuelve TRUE si este worker lo obtuvo.
CREATE OR REPLACE FUNCTION claim_job_lock(
  p_name TEXT,
  p_worker TEXT,
  p_ttl_seconds INTEGER DEFAULT 300
)
RETURNS BOOLEAN AS $$
DECLARE
  v_got BOOLEAN := FALSE;
BEGIN
  INSERT INTO job_locks (name, locked_by, locked_until, updated_at)
  VALUES (p_name, p_worker, NOW() + make_interval(secs => p_ttl_seconds), NOW())
  ON CONFLICT (name) DO UPDATE
    SET locked_by = EXCLUDED.locked_by,
        locked_until = EXCLUDED.locked_until,
        updated_at = NOW()
    WHERE job_locks.locked_until < NOW()
       OR job_locks.locked_by = p_worker
  RETURNING TRUE INTO v_got;
  RETURN COALESCE(v_got, FALSE);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_job_lock(p_name TEXT, p_worker TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE job_locks
  SET locked_until = NOW(), updated_at = NOW()
  WHERE name = p_name AND locked_by = p_worker;
END;
$$ LANGUAGE plpgsql;

-- ── RLS: lectura para usuarios logueados, escritura sólo service role ──────

ALTER TABLE hub_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_locks ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_modes ENABLE ROW LEVEL SECURITY;
ALTER TABLE provider_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE external_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view hub_jobs" ON hub_jobs;
CREATE POLICY "Authenticated users can view hub_jobs" ON hub_jobs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view job_locks" ON job_locks;
CREATE POLICY "Authenticated users can view job_locks" ON job_locks FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view system_flags" ON system_flags;
CREATE POLICY "Authenticated users can view system_flags" ON system_flags FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view automation_modes" ON automation_modes;
CREATE POLICY "Authenticated users can view automation_modes" ON automation_modes FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view provider_budgets" ON provider_budgets;
CREATE POLICY "Authenticated users can view provider_budgets" ON provider_budgets FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view external_calls" ON external_calls;
CREATE POLICY "Authenticated users can view external_calls" ON external_calls FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated users can view integration_status" ON integration_status;
CREATE POLICY "Authenticated users can view integration_status" ON integration_status FOR SELECT TO authenticated USING (true);
