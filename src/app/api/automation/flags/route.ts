import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { loadFlags, setFlag } from '@/lib/jobs/flags'
import { logEvent } from '@/lib/logs'

/** GET /api/automation/flags — todos los kill switches. */
export async function GET() {
  const { authorized } = await checkSectionAccess('automatizacion')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const db = createAdminClient()
    const flags = await loadFlags(db)
    return NextResponse.json({ flags: [...flags.values()].sort((a, b) => a.key.localeCompare(b.key)) })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * PATCH /api/automation/flags  { key, enabled, reason? }
 *
 * Prender o apagar un switch. Apagar siempre lleva motivo: es lo que se lee
 * en la pantalla cuando alguien pregunta por qué no corre algo.
 */
export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('automatizacion')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = await request.json() as { key?: string; enabled?: boolean; reason?: string }
    if (!body.key || typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'key y enabled son obligatorios' }, { status: 400 })
    }
    if (!body.enabled && !body.reason?.trim()) {
      return NextResponse.json({ error: 'Para apagar un switch hay que indicar el motivo' }, { status: 400 })
    }

    const db = createAdminClient()
    await setFlag(db, body.key, body.enabled, user?.email ?? null, body.reason?.trim())
    await logEvent(db, {
      source: 'automation',
      action: body.enabled ? 'flag.enabled' : 'flag.disabled',
      message: `${body.enabled ? 'Prendido' : 'Apagado'} ${body.key}${body.reason ? `: ${body.reason}` : ''}`,
      level: body.enabled ? 'info' : 'warning',
      details: { key: body.key, reason: body.reason ?? null },
    }, user ? { id: user.id, email: user.email } : null)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
