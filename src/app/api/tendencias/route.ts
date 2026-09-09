import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { authorizeCron } from '@/lib/cron/auth'
import { errorResponse } from '@/lib/api/errors'
import { getLatestSignals, getOpenAlerts, getPendingTrendJob, getRun, getRunAlerts, getRunDestinations, listRuns } from '@/lib/tendencias/queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/tendencias?run_id=
 *
 * Última corrida completada (o la pedida) con destinos, alertas y señales.
 * Acepta sesión con acceso a Producto o las credenciales de servicio.
 */
export async function GET(request: NextRequest) {
  const session = await checkSectionAccess('producto')
  if (!session.authorized) {
    const service = authorizeCron(request)
    if (!service.ok) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  try {
    const db = createAdminClient()
    const runId = request.nextUrl.searchParams.get('run_id')
    const run = await getRun(db, runId)
    const [destinations, alerts, openAlerts, signals, runs, pendingJob] = await Promise.all([
      run ? getRunDestinations(db, run.id) : Promise.resolve([]),
      run ? getRunAlerts(db, run.id) : Promise.resolve([]),
      getOpenAlerts(db),
      getLatestSignals(db),
      listRuns(db),
      getPendingTrendJob(db),
    ])
    return NextResponse.json({ run, destinations, alerts, openAlerts, signals, runs, pendingJob })
  } catch (error) {
    return errorResponse(error)
  }
}
