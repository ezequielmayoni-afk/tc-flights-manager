import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { createManualLink } from '@/lib/cupos/links'

export const dynamic = 'force-dynamic'

const schema = z.object({ flightId: z.number().int().positive(), tcPackageId: z.number().int().positive() })

/** POST /api/dashboard/cupos/link { flightId, tcPackageId } — vincula a mano un cupo (ida + vuelta) con un paquete por su ID de siviajo.com. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('flightId y tcPackageId (numéricos) son obligatorios')
    const { flightId, tcPackageId } = parsed.data
    const db = createAdminClient()
    const { data: pkg } = await db.from('packages').select('id, tc_package_id, title, tc_active').eq('tc_package_id', tcPackageId).maybeSingle()
    if (!pkg) throw API_ERRORS.NOT_FOUND(`El paquete ${tcPackageId} en HUB (¿ya se importó?)`)
    const actor = user?.email ?? 'ui'
    const { flightIds } = await createManualLink(db, flightId, pkg.id, actor)
    await logEvent(db, { source: 'cupos', action: 'cupo.link_manual', message: `Cupo ${flightIds.join('+')} vinculado a mano con ${pkg.tc_package_id}`, entityType: 'package', entityId: pkg.id, entityLabel: `${pkg.tc_package_id} · ${pkg.title}`, details: { flightIds, tcPackageId } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, packageId: pkg.id, title: pkg.title, flightIds })
  } catch (error) {
    return errorResponse(error)
  }
}
