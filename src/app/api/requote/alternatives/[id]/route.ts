import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess, isReadOnlyRole } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * PATCH /api/requote/alternatives/[id] { action: 'approve' | 'reject' }
 * Aprobar deja la propuesta lista para aplicarla en siviajo.com (la
 * aplicación automática es el paso siguiente); rechazar la archiva.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (user && isReadOnlyRole(user.role)) return NextResponse.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  try {
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) throw API_ERRORS.BAD_REQUEST('id inválido')
    const body = (await request.json().catch(() => null)) as { action?: unknown; note?: unknown } | null
    const action = body?.action
    if (action !== 'approve' && action !== 'reject') throw API_ERRORS.BAD_REQUEST('action debe ser approve o reject')
    const db = createAdminClient()
    const { data: alt } = await db.from('requote_alternatives').select('id, package_id, status, proposed_departure, price_pp, current_price_pp').eq('id', id).maybeSingle()
    if (!alt) throw API_ERRORS.NOT_FOUND(`La propuesta ${id}`)
    if (!['proposed', 'approved'].includes(String(alt.status))) throw API_ERRORS.CONFLICT(`La propuesta está ${alt.status}; no se puede cambiar`)
    const status = action === 'approve' ? 'approved' : 'rejected'
    const now = new Date().toISOString()
    const { error } = await db.from('requote_alternatives').update({ status, decided_by: user?.email ?? null, decided_at: now, ...(typeof body?.note === 'string' && body.note ? { reason: body.note } : {}) }).eq('id', id)
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'cupos', action: `requote_alternative.${status}`, message: `Fecha alternativa ${alt.proposed_departure} (USD ${alt.price_pp} vs ${alt.current_price_pp}) ${status === 'approved' ? 'aprobada' : 'rechazada'}`, entityType: 'package', entityId: Number(alt.package_id), details: { alternativeId: id } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, status })
  } catch (error) {
    return errorResponse(error)
  }
}
