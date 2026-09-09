import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { applyDecision, rejectDecision, revertDecision } from '@/lib/marketing/guard/apply'

/**
 * PATCH /api/marketing/decisions/[id]  { action: 'approve' | 'reject' | 'revert', reason? }
 * approve aplica ya mismo; reject la cierra; revert deshace una aplicada.
 */
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await context.params
    const decisionId = Number(id)
    if (!decisionId) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { action?: string; reason?: string }
    const actor = user?.email ?? 'ui'
    const db = createAdminClient()

    if (body.action === 'approve') {
      const r = await applyDecision(db, decisionId, actor)
      return NextResponse.json(r, { status: r.ok ? 200 : 409 })
    }
    if (body.action === 'reject') {
      await rejectDecision(db, decisionId, actor, body.reason)
      return NextResponse.json({ ok: true })
    }
    if (body.action === 'revert') {
      const r = await revertDecision(db, decisionId, actor)
      return NextResponse.json(r, { status: r.ok ? 200 : 409 })
    }
    return NextResponse.json({ error: 'action debe ser approve | reject | revert' }, { status: 400 })
  } catch (error) {
    return errorResponse(error)
  }
}
