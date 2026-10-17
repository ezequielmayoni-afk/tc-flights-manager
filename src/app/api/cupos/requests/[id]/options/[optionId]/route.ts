import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
const schema = z.object({ decision: z.enum(['accept', 'reject', 'reopen']), reason: z.string().max(300).nullable().optional() })

/** PATCH — aceptar o rechazar una tirada (con motivo). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; optionId: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id, optionId } = await params
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('decision: accept | reject | reopen')
    const db = createAdminClient()
    const { data: opt } = await db.from('cupo_request_options').select('id, status, request_id').eq('id', Number(optionId)).eq('request_id', Number(id)).maybeSingle()
    if (!opt) throw API_ERRORS.NOT_FOUND('La tirada')
    if (opt.status === 'loaded') throw API_ERRORS.BAD_REQUEST('La tirada ya tiene el cupo cargado')
    const now = new Date().toISOString()
    const actor = user?.email ?? 'ui'
    const status = parsed.data.decision === 'accept' ? 'accepted' : parsed.data.decision === 'reject' ? 'rejected' : 'quoted'
    const { error } = await db.from('cupo_request_options').update({ status, decision_reason: parsed.data.reason ?? null, decided_by: actor, decided_at: now, updated_at: now }).eq('id', opt.id)
    if (error) throw new Error(error.message)
    const { data: req } = await db.from('cupo_requests').select('status').eq('id', Number(id)).maybeSingle()
    if (req && ['answered', 'sent'].includes(req.status) && status === 'accepted') await db.from('cupo_requests').update({ status: 'confirming', updated_at: now }).eq('id', Number(id))
    await logEvent(db, { source: 'cupos', action: `cupo_option.${status}`, message: `Pedido #${id}: tirada ${optionId} ${status}${parsed.data.reason ? ` (${parsed.data.reason})` : ''}`, entityType: 'cupo_request', entityId: Number(id) }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, status })
  } catch (error) {
    return errorResponse(error)
  }
}
