import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createIdea } from '@/lib/producto/ideas'
import { logEvent } from '@/lib/logs'

/**
 * POST /api/tendencias/alerts/[id]/create-idea  { month?, nights?, autoStart? }
 * Una alerta de Tendencias se convierte en una idea con los defaults del perfil.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await context.params
    const body = await request.json().catch(() => ({})) as { month?: string; nights?: number; autoStart?: boolean }
    const db = createAdminClient()
    const { data: alert } = await db.from('trend_alerts').select('id, destination, data, acknowledged').eq('id', id).maybeSingle()
    if (!alert) return NextResponse.json({ error: 'Alerta no encontrada' }, { status: 404 })
    const slug = (alert.data as { destinationSlug?: string } | null)?.destinationSlug
    const result = await createIdea(db, {
      destinationText: slug ?? alert.destination,
      month: body.month ?? null,
      nights: body.nights ?? null,
      source: 'trend',
      trendAlertId: alert.id,
      autoStart: body.autoStart ?? true,
      createdBy: user?.email ?? 'ui',
      notes: `Desde la alerta de Tendencias: ${alert.destination}`,
    })
    await db.from('trend_alerts').update({ acknowledged: true, action_taken: 'idea_created', idea_id: result.id, acknowledged_by: user?.email ?? null, acknowledged_at: new Date().toISOString() }).eq('id', id)
    await logEvent(db, { source: 'automation', action: 'tendencias.idea_created', message: `Idea #${result.id} creada desde la alerta de ${alert.destination}`, details: { alertId: id, ideaId: result.id, profile: result.profile?.code ?? null } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, ideaId: result.id, profile: result.profile ? { code: result.profile.code, name: result.profile.name } : null, status: result.status, validation: result.validation })
  } catch (error) {
    return errorResponse(error)
  }
}
