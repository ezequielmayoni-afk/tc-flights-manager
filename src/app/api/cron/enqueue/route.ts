import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCron } from '@/lib/cron/auth'
import { enqueueJob } from '@/lib/jobs/queue'
import type { Db, EnqueueInput } from '@/lib/jobs/types'
import { logEvent } from '@/lib/logs'

export const dynamic = 'force-dynamic'

type Schedule = 'hourly' | 'daily' | 'nightly' | 'weekly'

/**
 * Qué se encola en cada disparo del crontab. Cada fase del loop suma sus
 * jobs acá; el crontab no cambia. Las claves de dedupe llevan la fecha (o la
 * hora) para que un mismo disparo no duplique jobs si el cron se repite.
 */
async function buildSchedule(schedule: Schedule, db: Db, now: Date): Promise<EnqueueInput[]> {
  const day = now.toISOString().slice(0, 10)
  const hour = now.toISOString().slice(0, 13)
  void db

  switch (schedule) {
    case 'hourly':
      return [
        // Fase 2: insights.sync → marketing.guard → ads.autopilot
        { kind: 'noop', payload: { ms: 0, schedule, at: hour }, dedupeKey: `noop:hourly:${hour}` },
      ]
    case 'daily':
      return [
        // Fase 2: cupo.link_refresh, cupo.sold_out_sweep · Fase 4: marketing.evaluate
        // Fase 10: requote.alternatives · Fase 11: ig.media_sync
        { kind: 'noop', payload: { ms: 0, schedule, at: day }, dedupeKey: `noop:daily:${day}` },
      ]
    case 'nightly':
      return [
        // Fase 8: crm.rollup (lane crm, ventana 05:00–09:00 UTC)
        { kind: 'noop', payload: { ms: 0, schedule, at: day }, dedupeKey: `noop:nightly:${day}` },
      ]
    case 'weekly':
      return [
        // Fase 1: trend.run, demand.signals · Fase 3: profile.audit · Fase 13: competencia.run
        { kind: 'noop', payload: { ms: 0, schedule, at: day }, dedupeKey: `noop:weekly:${day}` },
      ]
  }
}

/**
 * GET/POST /api/cron/enqueue?schedule=hourly|daily|nightly|weekly
 *
 * Encola los jobs de un disparo agendado y devuelve qué encoló. No ejecuta
 * nada: de eso se ocupa jobs-tick en el minuto siguiente.
 */
async function handle(request: NextRequest) {
  const auth = authorizeCron(request)
  if (!auth.ok) return auth.response

  const schedule = request.nextUrl.searchParams.get('schedule') as Schedule | null
  if (!schedule || !['hourly', 'daily', 'nightly', 'weekly'].includes(schedule)) {
    return NextResponse.json({ error: 'schedule inválido: hourly | daily | nightly | weekly' }, { status: 400 })
  }

  const db = createAdminClient()
  const now = new Date()
  const inputs = await buildSchedule(schedule, db, now)

  const enqueued: Array<{ kind: string; id: number | null; deduped: boolean }> = []
  const errors: Array<{ kind: string; error: string }> = []
  for (const input of inputs) {
    try {
      const result = await enqueueJob(db, { ...input, createdBy: `cron:${schedule}` })
      enqueued.push({ kind: input.kind, ...result })
    } catch (err) {
      errors.push({ kind: input.kind, error: err instanceof Error ? err.message : String(err) })
    }
  }

  await logEvent(db, {
    source: 'automation',
    action: `cron.enqueue.${schedule}`,
    message: `Encolados ${enqueued.filter(e => !e.deduped).length} jobs (${schedule})${errors.length ? `, ${errors.length} con error` : ''}`,
    level: errors.length ? 'warning' : 'info',
    details: { schedule, enqueued, errors },
  }, null)

  return NextResponse.json({ ok: errors.length === 0, schedule, enqueued, errors })
}

export const GET = handle
export const POST = handle
