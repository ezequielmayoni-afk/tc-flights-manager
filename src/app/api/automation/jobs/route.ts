import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { enqueueJob, cancelJob } from '@/lib/jobs/queue'
import { getHandlerDefinition, listHandlers } from '@/lib/jobs/handlers'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

/**
 * GET /api/automation/jobs?status=&kind=&limit=
 * Últimos jobs, más reciente primero.
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('automatizacion')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const params = request.nextUrl.searchParams
    const limit = Math.min(Number(params.get('limit') ?? 100), 500)
    const db = createAdminClient()
    let query = db.from('hub_jobs').select('*').order('created_at', { ascending: false }).limit(limit)
    const status = params.get('status')
    const kind = params.get('kind')
    if (status) query = query.eq('status', status)
    if (kind) query = query.eq('kind', kind)
    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ jobs: data ?? [], kinds: listHandlers().map(h => ({ kind: h.kind, lane: h.lane, description: h.description })) })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * POST /api/automation/jobs  { kind, payload?, priority? }
 * Encola un job a mano (prioridad manual: salta las ventanas horarias).
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('automatizacion')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = await request.json() as { kind?: string; payload?: Record<string, unknown>; priority?: number }
    if (!body.kind || !getHandlerDefinition(body.kind)) {
      return NextResponse.json({ error: `kind desconocido: ${body.kind ?? ''}` }, { status: 400 })
    }
    const db = createAdminClient()
    const result = await enqueueJob(db, {
      kind: body.kind,
      payload: body.payload ?? {},
      priority: body.priority ?? MANUAL_PRIORITY,
      createdBy: user?.email ?? 'ui',
    })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return errorResponse(error)
  }
}

/** DELETE /api/automation/jobs?id=  — cancela un job todavía en cola. */
export async function DELETE(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('automatizacion')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const id = Number(request.nextUrl.searchParams.get('id'))
    if (!id) return NextResponse.json({ error: 'id obligatorio' }, { status: 400 })
    const db = createAdminClient()
    const cancelled = await cancelJob(db, id, user?.email ?? null)
    return NextResponse.json({ ok: cancelled, cancelled })
  } catch (error) {
    return errorResponse(error)
  }
}
