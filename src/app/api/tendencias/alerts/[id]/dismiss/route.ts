import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'

/**
 * POST /api/tendencias/alerts/[id]/dismiss — cierra una alerta sin acción.
 * "Crear idea" llega en la Fase 3, cuando exista package_ideas.
 */
export async function POST(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await context.params
    const db = createAdminClient()
    const { data, error } = await db
      .from('trend_alerts')
      .update({ acknowledged: true, action_taken: 'dismissed', acknowledged_by: user?.email ?? null, acknowledged_at: new Date().toISOString() })
      .eq('id', id)
      .eq('acknowledged', false)
      .select('id, destination, title')
      .maybeSingle()
    if (error) throw new Error(error.message)
    if (!data) return NextResponse.json({ error: 'La alerta no existe o ya estaba cerrada' }, { status: 404 })

    await logEvent(db, {
      source: 'automation',
      action: 'tendencias.alert_dismissed',
      message: `Alerta descartada: ${data.title}`,
      details: { alertId: id, destination: data.destination },
    }, user ? { id: user.id, email: user.email } : null)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
