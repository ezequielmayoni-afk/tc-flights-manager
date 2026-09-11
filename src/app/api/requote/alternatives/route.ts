import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess, isReadOnlyRole } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'

export const dynamic = 'force-dynamic'

/**
 * POST /api/requote/alternatives { packageId } — pide al cotizador la mejor
 * fecha de la misma temporada para un paquete (cupo agotado → sistema).
 * Encola `package.alternative_date` con prioridad manual; tarda 1 a 3 minutos.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (user && isReadOnlyRole(user.role)) return NextResponse.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  try {
    const body = (await request.json().catch(() => null)) as { packageId?: unknown; trigger?: unknown } | null
    const packageId = Number(body?.packageId)
    if (!Number.isInteger(packageId) || packageId <= 0) throw API_ERRORS.BAD_REQUEST('packageId inválido')
    const db = createAdminClient()
    const { data: pkg } = await db.from('packages').select('id, tc_package_id').eq('id', packageId).maybeSingle()
    if (!pkg) throw API_ERRORS.NOT_FOUND(`El paquete ${packageId}`)
    const job = await enqueueJob(db, { kind: 'package.alternative_date', payload: { packageId, trigger: typeof body?.trigger === 'string' ? body.trigger : 'manual' }, priority: MANUAL_PRIORITY, dedupeKey: `package.alternative_date:manual:${packageId}`, entityType: 'package', entityId: packageId, createdBy: user?.email ?? 'ui' })
    return NextResponse.json({ ok: true, jobId: job.id, deduped: job.deduped })
  } catch (error) {
    return errorResponse(error)
  }
}
