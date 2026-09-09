import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCron } from '@/lib/cron/auth'
import { enqueueJob } from '@/lib/jobs/queue'
import type { Db, EnqueueInput } from '@/lib/jobs/types'
import { logEvent } from '@/lib/logs'
import { isoWeekLabel } from '@/lib/tendencias/config'
import { SWEEP_ENQUEUE_HOUR_UTC } from '@/lib/vuelos-baratos/config'

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
    case 'hourly': {
      // Fase 2: insights.sync encola marketing.guard al terminar · Fase 9: ads.autopilot
      const utcHour = now.getUTCHours()
      const sunday = now.getUTCDay() === 0
      const datePreset = sunday && utcHour === 9 ? 'last_30d' : utcHour === 9 ? 'last_7d' : 'yesterday'
      const inputs: EnqueueInput[] = [
        { kind: 'insights.sync', payload: { datePreset, at: hour }, dedupeKey: `insights.sync:${hour}` },
      ]
      // Barrido de vuelos.siviajo.com: una sola vez por noche, al abrir la
      // ventana del lane `cotizador`.
      if (utcHour === SWEEP_ENQUEUE_HOUR_UTC) {
        inputs.push({ kind: 'flights.sweep.plan', payload: { day }, dedupeKey: `flights.sweep.plan:${day}` })
      }
      return inputs
    }
    case 'daily': {
      // Fase 4: marketing.evaluate · Fase 10: requote.alternatives · Fase 11: ig.media_sync
      const digestAt = new Date(`${day}T10:00:00Z`) // 07:00 ART
      return [
        { kind: 'cupo.link_refresh', payload: { at: day }, dedupeKey: `cupo.link_refresh:${day}` },
        { kind: 'health.check', payload: { at: day }, dedupeKey: `health.check:${day}` },
        { kind: 'health.digest', payload: { at: day }, dedupeKey: `health.digest:${day}`, runAfter: digestAt },
      ]
    }
    case 'nightly':
      return [
        // Fase 8: crm.rollup (lane crm, ventana 05:00–09:00 UTC)
        { kind: 'tc.reconcile', payload: { at: day }, dedupeKey: `tc.reconcile:${day}` },
      ]
    case 'weekly': {
      // Fase 13: competencia.run
      const week = isoWeekLabel(now)
      return [
        { kind: 'trend.run', payload: { trigger: 'cron', week }, dedupeKey: 'trend.run', maxAttempts: 2 },
        { kind: 'demand.signals', payload: { week }, dedupeKey: 'demand.signals' },
        { kind: 'profile.audit', payload: { week }, dedupeKey: `profile.audit:${week}` },
      ]
    }
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
