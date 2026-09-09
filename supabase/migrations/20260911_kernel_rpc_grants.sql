-- Defensa en profundidad para el kernel de jobs.
--
-- Las RPCs del runner (claim_next_jobs, requeue_stale_jobs, claim_job_lock,
-- release_job_lock) las llama únicamente HUB con la service role. Por defecto
-- PostgREST las expone también a anon/authenticated; son SECURITY INVOKER y
-- la RLS de hub_jobs/job_locks las deja sin efecto para esos roles, pero no
-- hay motivo para que sean invocables desde el navegador. Se revoca.

REVOKE EXECUTE ON FUNCTION claim_next_jobs(TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION requeue_stale_jobs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION claim_job_lock(TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION release_job_lock(TEXT, TEXT) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_next_jobs(TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION requeue_stale_jobs() TO service_role;
GRANT EXECUTE ON FUNCTION claim_job_lock(TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_job_lock(TEXT, TEXT) TO service_role;
