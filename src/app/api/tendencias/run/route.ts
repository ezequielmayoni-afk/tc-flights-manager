import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { logEvent } from '@/lib/logs'

/**
 * POST /api/tendencias/run — "Correr ahora" desde la pantalla.
 *
 * Encola trend.run y demand.signals con prioridad manual. Si ya hay una
 * corrida en cola o corriendo, devuelve esa (dedupe) en vez de duplicarla.
 */
export async function POST() {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const db = createAdminClient()
    const createdBy = user?.email ?? 'ui'
    const trend = await enqueueJob(db, {
      kind: 'trend.run',
      payload: { trigger: 'manual' },
      priority: MANUAL_PRIORITY,
      dedupeKey: 'trend.run',
      maxAttempts: 1,
      createdBy,
    })
    const signals = await enqueueJob(db, {
      kind: 'demand.signals',
      payload: { trigger: 'manual' },
      priority: MANUAL_PRIORITY,
      dedupeKey: 'demand.signals',
      createdBy,
    })

    await logEvent(db, {
      source: 'automation',
      action: 'tendencias.run_requested',
      message: trend.deduped ? `Tendencias ya estaba en cola (job #${trend.id})` : `Tendencias encolada a mano (job #${trend.id})`,
      details: { trend, signals },
    }, user ? { id: user.id, email: user.email } : null)

    return NextResponse.json({ ok: true, trend, signals })
  } catch (error) {
    return errorResponse(error)
  }
}
