import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

/** POST — (re)arma las tiradas: encola cupo.probe con prioridad manual. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const { data: req } = await db.from('cupo_requests').select('id, status').eq('id', id).maybeSingle()
    if (!req) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    if (!['draft', 'ready', 'probing'].includes(req.status)) throw API_ERRORS.BAD_REQUEST(`El pedido está ${req.status}: ya no se sondea`)
    const actor = user?.email ?? 'ui'
    const job = await enqueueJob(db, { kind: 'cupo.probe', payload: { requestId: id, actor }, priority: MANUAL_PRIORITY, dedupeKey: `cupo.probe:${id}`, entityType: 'cupo_request', entityId: id, createdBy: actor })
    await db.from('cupo_requests').update({ status: 'probing', probe_job_id: job.id, probe_error: null }).eq('id', id)
    return NextResponse.json({ ok: true, jobId: job.id, deduped: job.deduped })
  } catch (error) {
    return errorResponse(error)
  }
}
