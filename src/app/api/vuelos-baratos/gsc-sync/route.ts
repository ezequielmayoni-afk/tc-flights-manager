import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vuelos-baratos/gsc-sync — "Sincronizar Search Console" a mano.
 *
 * Encola el mismo `gsc.vuelos_sync` del cron diario, con prioridad manual (el
 * lane `gsc` no tiene ventana horaria, así que corre en el próximo tick). La
 * clave de dedupe lleva `manual:` y el día: se puede pedir una corrida aunque
 * la del cron ya haya pasado, pero dos clics seguidos no encolan dos jobs.
 *
 * Gasta de la misma cuota diaria (100 llamadas): una corrida son ~23.
 */
export async function POST() {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const db = createAdminClient()
    const day = todayIso(new Date())
    const job = await enqueueJob(db, {
      kind: 'gsc.vuelos_sync',
      payload: { at: day, trigger: 'manual' },
      priority: MANUAL_PRIORITY,
      dedupeKey: `gsc.vuelos_sync:manual:${day}`,
      createdBy: user?.email ?? 'ui',
    })

    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.gsc_sync_requested',
        message: job.deduped
          ? 'Search Console: la sincronización manual de hoy ya estaba encolada'
          : 'Search Console: sincronización manual encolada',
        details: { day, job },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json({ ok: true, job })
  } catch (error) {
    return errorResponse(error)
  }
}
