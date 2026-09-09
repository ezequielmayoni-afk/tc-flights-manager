-- RLS en las 21 tablas que media-os creó en esta misma base.
--
-- media-os las escribía con la ANON key, la misma que HUB publica en el
-- navegador: cualquiera con esa clave podía escribir marketing_queue y
-- compañía desde afuera. Se cierran igual que el resto de HUB: lectura para
-- usuarios logueados, escritura sólo con service role (que saltea RLS).
-- El código de media-os que quede corriendo en local pasa a usar la service
-- key (una línea en su .env.local); el que se porta a HUB ya la usa.

DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'agent_memory', 'agent_tasks',
    'budget_alerts', 'budget_allocations',
    'competencia_runs', 'competitor_ads',
    'editorial_calendar', 'email_campaigns',
    'feed_package_state', 'intelligence_reports',
    'marketing_queue', 'pipeline_runs',
    'reputacion_runs', 'reputation_alerts', 'reputation_reviews',
    'selector_store',
    'seo_generations', 'seo_snapshots',
    'trend_alerts', 'trend_destinations', 'trend_runs'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I', 'Authenticated users can view ' || t, t);
      EXECUTE format(
        'CREATE POLICY %I ON %I FOR SELECT TO authenticated USING (true)',
        'Authenticated users can view ' || t, t
      );
    END IF;
  END LOOP;
END $$;
