import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { enqueueJob } from '@/lib/jobs/queue'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { isoWeekLabel } from '@/lib/tendencias/config'

type ManualKind = 'gsc.site_sync' | 'serp.track' | 'geo.probe'

const LABELS: Record<ManualKind, string> = {
  'gsc.site_sync': 'Search Console',
  'serp.track': 'Posiciones en Google',
  'geo.probe': 'Sondas de IA',
}

/**
 * "Correr ahora" de los tres agentes de la Fase 14: encola el mismo job del
 * cron con prioridad manual y dedupe por día (`manual:` + fecha), igual que
 * `POST /api/vuelos-baratos/gsc-sync`. Los jobs gastan de sus presupuestos
 * (gsc 100/día, serpapi 250/día, llm_probe 60/día).
 */
export async function enqueueManualSeoJob(kind: ManualKind): Promise<NextResponse> {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const db = createAdminClient()
    const now = new Date()
    const day = now.toISOString().slice(0, 10)
    const week = isoWeekLabel(now)
    const job = await enqueueJob(db, {
      kind,
      payload: kind === 'gsc.site_sync' ? { at: day, trigger: 'manual' } : { week, trigger: 'manual' },
      priority: MANUAL_PRIORITY,
      dedupeKey: `${kind}:manual:${day}`,
      createdBy: user?.email ?? 'ui',
    })

    await logEvent(
      db,
      {
        source: 'automation',
        action: `seo.${kind.replace('.', '_')}_requested`,
        message: job.deduped ? `${LABELS[kind]}: la corrida manual de hoy ya estaba encolada` : `${LABELS[kind]}: corrida manual encolada`,
        details: { day, week, job },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json({ ok: true, job })
  } catch (error) {
    return errorResponse(error)
  }
}
