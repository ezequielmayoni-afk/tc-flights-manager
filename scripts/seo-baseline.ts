/**
 * Corre a mano los agentes de la Fase 14 (SEO + GEO) sin pasar por el runner
 * del VPS: sirve para la primera corrida (baseline) y para probar cambios.
 *
 *   npx -y tsx@4 --tsconfig tsconfig.json scripts/seo-baseline.ts [gsc|serp|geo|expiring|all] [--engines=chatgpt,gemini,claude]
 *
 * Carga `.env.local` como lo hace Next (`@next/env`): un `source` de shell
 * rompe el JSON de GOOGLE_DRIVE_CREDENTIALS. `--engines` limita las sondas de
 * IA a esos motores (sirve para repetir uno solo sin gastar el presupuesto). Cada
 * corrida crea una fila en `hub_jobs` con `run_after` lejano (para que el
 * runner no la tome) y la cierra como `done`/`failed` al terminar, así las
 * llamadas externas quedan atadas a un job real y cuentan en los presupuestos.
 */
import { loadEnvConfig } from '@next/env'
loadEnvConfig(process.cwd())

import { getHandlerDefinition } from '@/lib/jobs/handlers'
import { enqueueJob } from '@/lib/jobs/queue'
import type { JobRow } from '@/lib/jobs/types'
import { createAdminClient } from '@/lib/supabase/admin'

const KINDS: Record<string, string[]> = {
  gsc: ['gsc.site_sync'],
  serp: ['serp.track'],
  geo: ['geo.probe'],
  expiring: ['seo.expiring'],
  all: ['gsc.site_sync', 'serp.track', 'geo.probe', 'seo.expiring'],
}

async function main() {
  const which = process.argv.find(a => !a.startsWith('--') && a !== process.argv[0] && a !== process.argv[1]) ?? 'all'
  const enginesArg = process.argv.find(a => a.startsWith('--engines='))
  const engines = enginesArg ? enginesArg.slice('--engines='.length).split(',').map(e => e.trim()).filter(Boolean) : undefined
  const kinds = KINDS[which]
  if (!kinds) throw new Error(`uso: seo-baseline.ts [gsc|serp|geo|all] (recibí "${which}")`)

  const db = createAdminClient()
  for (const kind of kinds) {
    const def = getHandlerDefinition(kind)
    if (!def) throw new Error(`handler desconocido: ${kind}`)

    const stamp = new Date().toISOString()
    const enq = await enqueueJob(db, {
      kind,
      payload: { trigger: 'script', at: stamp, ...(engines && kind === 'geo.probe' ? { engines } : {}) },
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
