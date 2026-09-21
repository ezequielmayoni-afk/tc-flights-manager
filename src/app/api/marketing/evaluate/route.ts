import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

/** POST /api/marketing/evaluate { packageIds?: number[] } — encola la evaluación ahora (segundos). */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const body = (await request.json().catch(() => null)) as { packageIds?: unknown } | null
    const packageIds = Array.isArray(body?.packageIds) ? body!.packageIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : undefined
    const db = createAdminClient()
    const job = await enqueueJob(db, { kind: 'marketing.evaluate', payload: { trigger: 'manual', ...(packageIds?.length ? { packageIds } : {}) }, priority: MANUAL_PRIORITY, dedupeKey: `marketing.evaluate:manual:${packageIds?.length ? packageIds.join('-').slice(0, 80) : 'all'}`, createdBy: user?.email ?? 'ui' })
    return NextResponse.json({ ok: true, jobId: job.id, deduped: job.deduped })
  } catch (error) {
    return errorResponse(error)
  }
}
