import { logEvent } from '@/lib/logs'
import type { Db, JobOutcome, JobRow, Lane } from './types'
import { ALL_LANES, LANES, isLaneOpen, MANUAL_PRIORITY } from './lanes'
import { firstDisabledFlag, loadFlags } from './flags'
import { getBudgetStatus } from './budget'
import { getHandlerDefinition } from './handlers'

export interface TickSummary {
  worker: string
  requeuedStale: number
  lanes: Record<string, { claimed: number; done: number; failed: number; skipped: number; lockBusy: boolean }>
  durationMs: number
}

const HEARTBEAT_EVERY_MS = 30_000

function backoffSeconds(attempt: number): number {
  // 1 min, 4 min, 16 min… con techo de una hora.
  return Math.min(60 * 4 ** (attempt - 1), 3600)
}

async function finishJob(db: Db, job: JobRow, outcome: JobOutcome): Promise<'done' | 'failed' | 'skipped' | 'queued'> {
  const now = new Date().toISOString()

  if (outcome.ok) {
    await db.from('hub_jobs').update({
      status: 'done', result: outcome.result ?? null, finished_at: now, locked_by: null, locked_until: null, last_error: null,
    }).eq('id', job.id)
    return 'done'
  }

  if ('skipped' in outcome && outcome.skipped) {
    await db.from('hub_jobs').update({
      status: 'skipped', last_error: outcome.reason, finished_at: now, locked_by: null, locked_until: null,
    }).eq('id', job.id)
    return 'skipped'
  }

  const error = 'error' in outcome ? outcome.error : 'error desconocido'
  const retry = ('retry' in outcome ? outcome.retry : true) !== false && job.attempts < job.max_attempts
  if (retry) {
    const runAfter = new Date(Date.now() + backoffSeconds(job.attempts) * 1000).toISOString()
    await db.from('hub_jobs').update({
      status: 'queued', last_error: error, run_after: runAfter, locked_by: null, locked_until: null,
      result: 'result' in outcome ? outcome.result ?? null : null,
    }).eq('id', job.id)
    return 'queued'
  }
  await db.from('hub_jobs').update({
    status: 'failed', last_error: error, finished_at: now, locked_by: null, locked_until: null,
    result: 'result' in outcome ? outcome.result ?? null : null,
  }).eq('id', job.id)
  return 'failed'
}

async function runOne(db: Db, job: JobRow, worker: string, flags: Awaited<ReturnType<typeof loadFlags>>) {
  const definition = getHandlerDefinition(job.kind)
  const lease = LANES[job.lane as Lane]?.leaseSeconds ?? 900

  const heartbeat = async () => {
    await db.from('hub_jobs').update({
      heartbeat_at: new Date().toISOString(),
      locked_until: new Date(Date.now() + lease * 1000).toISOString(),
    }).eq('id', job.id).eq('locked_by', worker)
  }

  const log = async (message: string, details?: Record<string, unknown>, level: 'info' | 'warning' | 'error' = 'info') => {
    await logEvent(db, {
      source: 'automation',
      action: `job.${job.kind}`,
      message,
      level,
      details: { jobId: job.id, kind: job.kind, lane: job.lane, attempt: job.attempts, ...details },
    }, null)
  }

  if (!definition) {
    return finishJob(db, job, { ok: false, error: `Handler no registrado para kind=${job.kind}`, retry: false })
  }

  // Kill switches: apagado ⇒ skipped, nunca failed. El job no se pierde: quien
  // lo encoló puede volver a encolarlo cuando el flag se prenda.
  const disabled = firstDisabledFlag(flags, definition.flags)
  if (disabled) {
    return finishJob(db, job, { ok: false, skipped: true, reason: `flag apagado: ${disabled}` })
  }

  if (definition.provider) {
    const budget = await getBudgetStatus(db, definition.provider)
    if (budget.exhausted) {
      return finishJob(db, job, { ok: false, skipped: true, reason: `presupuesto agotado: ${definition.provider} (${budget.pct}%)` })
    }
  }

  const timer = setInterval(() => { void heartbeat() }, HEARTBEAT_EVERY_MS)
  const started = Date.now()
  try {
    const outcome = await definition.handler({ db, job, heartbeat, log })
    const status = await finishJob(db, job, outcome)
    if (status === 'failed') {
      await log(`falló definitivamente: ${'error' in outcome ? outcome.error : ''}`, { durationMs: Date.now() - started }, 'error')
    }
    return status
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status = await finishJob(db, job, { ok: false, error: message })
    await log(`excepción: ${message}`, { durationMs: Date.now() - started }, status === 'failed' ? 'error' : 'warning')
    return status
  } finally {
    clearInterval(timer)
  }
}

/**
 * Un tick: reencola leases vencidos y, por cada lane que consiga su lock,
 * toma hasta `concurrency` jobs listos y los corre. Deja de tomar jobs al
 * agotar `maxMs`, pero termina los que ya empezó.
 *
 * Dos ticks a la vez no se pisan: el lock por lane hace que el segundo
 * encuentre el lane ocupado y siga con los demás.
 */
export async function runTick(db: Db, options: { maxMs?: number; lanes?: Lane[]; worker?: string } = {}): Promise<TickSummary> {
  const started = Date.now()
  const maxMs = options.maxMs ?? 240_000
  const worker = options.worker ?? `hub-${process.pid}-${started.toString(36)}`
  const lanes = options.lanes ?? ALL_LANES
  const summary: TickSummary = { worker, requeuedStale: 0, lanes: {}, durationMs: 0 }

  const { data: stale } = await db.rpc('requeue_stale_jobs')
  summary.requeuedStale = Number(stale ?? 0)

  const flags = await loadFlags(db)
  const now = new Date()

  for (const lane of lanes) {
    const config = LANES[lane]
    const laneSummary = { claimed: 0, done: 0, failed: 0, skipped: 0, lockBusy: false }
    summary.lanes[lane] = laneSummary

    if (Date.now() - started > maxMs) break

    const { data: gotLock } = await db.rpc('claim_job_lock', { p_name: `lane:${lane}`, p_worker: worker, p_ttl_seconds: config.leaseSeconds })
    if (!gotLock) {
      laneSummary.lockBusy = true
      continue
    }

    try {
      // Fuera de la ventana del lane sólo se toman jobs manuales.
      const minPriority = isLaneOpen(lane, 0, now) ? 0 : MANUAL_PRIORITY
      const { data: claimed, error } = await db.rpc('claim_next_jobs', {
        p_lane: lane, p_worker: worker, p_limit: config.concurrency, p_lease_seconds: config.leaseSeconds, p_min_priority: minPriority,
      })
      if (error) {
        console.error(`[jobs] claim_next_jobs(${lane}) falló:`, error.message)
        continue
      }
      const jobs = (claimed ?? []) as JobRow[]
      laneSummary.claimed = jobs.length

      const results = await Promise.all(jobs.map(job => runOne(db, job, worker, flags)))
      for (const status of results) {
        if (status === 'done') laneSummary.done++
        else if (status === 'skipped') laneSummary.skipped++
        else if (status === 'failed') laneSummary.failed++
      }
    } finally {
      await db.rpc('release_job_lock', { p_name: `lane:${lane}`, p_worker: worker })
    }
  }

  summary.durationMs = Date.now() - started
  return summary
}
