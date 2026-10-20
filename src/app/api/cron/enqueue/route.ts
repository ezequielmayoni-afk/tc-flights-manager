import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeCron } from '@/lib/cron/auth'
import { enqueueJob } from '@/lib/jobs/queue'
import type { Db, EnqueueInput } from '@/lib/jobs/types'
import { logEvent } from '@/lib/logs'
import { isoWeekLabel } from '@/lib/tendencias/config'
import { ESTIMATE_ENQUEUE_HOUR_UTC, SWEEP_ENQUEUE_HOUR_UTC } from '@/lib/vuelos-baratos/config'

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
      // Estimador de Sabre: a las 21:00 UTC, con la tanda repartida en 3 h
      // (run_after escalonado) para terminar una hora antes de que el barrido
      // decida qué fechas confirmar. El `day` es el UTC del momento de encolar,
      // que la última noche del mes es el día anterior al del barrido: ver el
      // comentario de ESTIMATE_ENQUEUE_HOUR_UTC.
      if (utcHour === ESTIMATE_ENQUEUE_HOUR_UTC) {
        inputs.push({ kind: 'flights.estimate.plan', payload: { day }, dedupeKey: `flights.estimate.plan:${day}` })
      }
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
        // Fase 4: vía marketing | manual | web por paquete, después del import de las 06:00.
        { kind: 'marketing.evaluate', payload: { at: day, trigger: 'daily' }, dedupeKey: `marketing.evaluate:${day}` },
        // Fase 7: semáforo de riesgo por cupo (después de refrescar vínculos).
        { kind: 'cupo.risk_eval', payload: { at: day }, dedupeKey: `cupo.risk_eval:${day}` },
        { kind: 'health.check', payload: { at: day }, dedupeKey: `health.check:${day}` },
        { kind: 'health.digest', payload: { at: day }, dedupeKey: `health.digest:${day}`, runAfter: digestAt },
        // Search Console de vuelos.siviajo.com: sitemap, indexación y métricas.
        // Sin ventana horaria (lane `gsc`), gasta como mucho 23 de las 100
        // llamadas del día.
        { kind: 'gsc.vuelos_sync', payload: { at: day }, dedupeKey: `gsc.vuelos_sync:${day}` },
        // Fase 14: Search Console de todo el dominio (páginas, consultas,
        // sitemaps, ~25 inspecciones). Mismo lane y cuota que el de vuelos.
        { kind: 'gsc.site_sync', payload: { at: day }, dedupeKey: `gsc.site_sync:${day}` },
        // Fase 14: fichas con tráfico cuya salida vence (Slack + /tareas). Lee el
        // gsc_page_stats de ayer, así que no depende de que el sync de hoy haya corrido.
        { kind: 'seo.expiring', payload: { at: day }, dedupeKey: `seo.expiring:${day}` },
        // Fase 14: títulos cuya temporada quedó desfasada respecto de la salida cargada en TC
        // (lane tc, ~1 llamada por paquete propio). Propone; aplica título/H1 si automation.seo_title_autoapply.
        { kind: 'seo.title_drift', payload: { at: day }, dedupeKey: `seo.title_drift:${day}` },
      ]
    }
    case 'nightly':
      return [
        // Fase 8: rollup del CRM (lane crm, ventana 05:00–09:00 UTC): últimos 7 días
        { kind: 'crm.rollup', payload: { at: day, days: 7 }, dedupeKey: `crm.rollup:${day}` },
        { kind: 'tc.reconcile', payload: { at: day }, dedupeKey: `tc.reconcile:${day}` },
        // Monitoreo de precio de los paquetes publicados (antes: tc-requote-bot a las 03:00 UTC)
        { kind: 'package.requote.plan', payload: { day }, dedupeKey: `package.requote.plan:${day}` },
      ]
    case 'weekly': {
      // Fase 13: competencia.run
      const week = isoWeekLabel(now)
      return [
        { kind: 'trend.run', payload: { trigger: 'cron', week }, dedupeKey: 'trend.run', maxAttempts: 2 },
        { kind: 'demand.signals', payload: { week }, dedupeKey: 'demand.signals' },
        { kind: 'profile.audit', payload: { week }, dedupeKey: `profile.audit:${week}` },
        // Fase 14: posiciones en Google AR (SerpAPI, ~45 llamadas) y sondas a
        // ChatGPT/Gemini/Claude (36 preguntas) — los lunes, después de Tendencias.
        { kind: 'serp.track', payload: { week }, dedupeKey: `serp.track:${week}` },
        { kind: 'geo.probe', payload: { week }, dedupeKey: `geo.probe:${week}` },
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
