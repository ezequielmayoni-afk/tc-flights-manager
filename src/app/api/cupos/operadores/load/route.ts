import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { logEvent } from '@/lib/logs'

export const dynamic = 'force-dynamic'
const schema = z.object({ ids: z.array(z.number().int().positive()).min(1).max(60) })

/** POST — encola la carga a la web de las tarifas elegidas (verificación en Sabre + HUB + TC). */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('Elegí entre 1 y 60 tarifas')
    const ids = [...new Set(parsed.data.ids)].sort((a, b) => a - b)
    const db = createAdminClient()
    const actor = user?.email ?? 'ui'
    const job = await enqueueJob(db, { kind: 'operator_cupos.load', payload: { ids, actor }, priority: MANUAL_PRIORITY, dedupeKey: `operator_cupos.load:${ids.join(',')}`, createdBy: actor })
    await logEvent(db, { source: 'cupos', action: 'operator_cupos.load', message: `Carga a la web de ${ids.length} cupo(s) de operador encolada`, details: { ids, jobId: job.id } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, jobId: job.id, count: ids.length })
  } catch (error) {
    return errorResponse(error)
  }
}

/** GET ?jobId= — estado y resultado de una carga. */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const jobId = Number(request.nextUrl.searchParams.get('jobId'))
    if (!jobId) throw API_ERRORS.BAD_REQUEST('jobId obligatorio')
    const { data } = await createAdminClient().from('hub_jobs').select('id, status, result, last_error, finished_at').eq('id', jobId).eq('kind', 'operator_cupos.load').maybeSingle()
    if (!data) throw API_ERRORS.NOT_FOUND(`La carga ${jobId}`)
    return NextResponse.json(data)
  } catch (error) {
    return errorResponse(error)
  }
}
