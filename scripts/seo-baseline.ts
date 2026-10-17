/**
 * Corre a mano los agentes de la Fase 14 (SEO + GEO) sin pasar por el runner
 * del VPS: sirve para la primera corrida (baseline) y para probar cambios.
 *
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-baseline.ts [gsc|serp|geo|all]
 *
 * Necesita `.env.local` cargado (`set -a; source .env.local; set +a`). Cada
 * corrida crea una fila en `hub_jobs` con `run_after` lejano (para que el
 * runner no la tome) y la cierra como `done`/`failed` al terminar, así las
 * llamadas externas quedan atadas a un job real y cuentan en los presupuestos.
 */
import { getHandlerDefinition } from '@/lib/jobs/handlers'
import { enqueueJob } from '@/lib/jobs/queue'
import type { JobRow } from '@/lib/jobs/types'
import { createAdminClient } from '@/lib/supabase/admin'

const KINDS: Record<string, string[]> = {
  gsc: ['gsc.site_sync'],
  serp: ['serp.track'],
  geo: ['geo.probe'],
  all: ['gsc.site_sync', 'serp.track', 'geo.probe'],
}

async function main() {
  const which = process.argv[2] ?? 'all'
  const kinds = KINDS[which]
  if (!kinds) throw new Error(`uso: seo-baseline.ts [gsc|serp|geo|all] (recibí "${which}")`)

  const db = createAdminClient()
  for (const kind of kinds) {
    const def = getHandlerDefinition(kind)
    if (!def) throw new Error(`handler desconocido: ${kind}`)

    const stamp = new Date().toISOString()
    const enq = await enqueueJob(db, {
      kind,
      payload: { trigger: 'script', at: stamp },
      dedupeKey: `${kind}:script:${stamp}`,
      priority: 9,
      // Diez años: el runner del VPS nunca lo va a reclamar.
      runAfter: new Date(Date.now() + 10 * 365 * 86_400_000),
      createdBy: 'scripts/seo-baseline.ts',
    })
    if (!enq.id) throw new Error(`no se pudo crear el job ${kind}`)

    const { data } = await db.from('hub_jobs').select('*').eq('id', enq.id).single()
    const job = data as JobRow
    console.log(`\n=== ${kind} (job #${job.id}) ===`)
    const started = Date.now()
    try {
      const outcome = await def.handler({
        db,
        job,
        heartbeat: async () => {},
        log: async (message, details, level) => {
          console.log(`[${level ?? 'info'}] ${message}`)
          if (details) console.log(JSON.stringify(details).slice(0, 1500))
        },
      })
      console.log('outcome:', JSON.stringify(outcome).slice(0, 2000))
      await db
        .from('hub_jobs')
        .update({ status: outcome.ok ? 'done' : 'skipped' in outcome && outcome.skipped ? 'skipped' : 'failed', result: outcome, finished_at: new Date().toISOString() })
        .eq('id', job.id)
    } catch (err) {
      console.error('ERROR', err)
      await db.from('hub_jobs').update({ status: 'failed', last_error: err instanceof Error ? err.message : String(err), finished_at: new Date().toISOString() }).eq('id', job.id)
    }
    console.log(`${kind}: ${Math.round((Date.now() - started) / 1000)} s`)
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error(err)
  process.exit(1)
})
