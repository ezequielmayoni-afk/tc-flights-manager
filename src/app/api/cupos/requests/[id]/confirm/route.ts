import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'
import { sendSlackMessage } from '@/lib/slack/client'

export const dynamic = 'force-dynamic'
const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

/** POST — confirma el pedido: las tiradas aceptadas quedan listas para cargar como cupo (ida + vuelta) en /flights. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const accepted = loaded.options.filter(o => o.status === 'accepted' || o.status === 'loaded')
    if (accepted.length === 0) throw API_ERRORS.BAD_REQUEST('Aceptá al menos una tirada antes de confirmar')
    const now = new Date().toISOString()
    const actor = user?.email ?? 'ui'
    await db.from('cupo_requests').update({ status: 'confirmed', confirmed_at: now, confirmed_by: actor, updated_at: now }).eq('id', id)
    const { data: s } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url').eq('id', 1).maybeSingle()
    if (s?.slack_enabled && s.slack_webhook_url) {
      const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
      await sendSlackMessage(s.slack_webhook_url, { text: `✅ Pedido de cupos #${id} confirmado (${loaded.request.title}): ${accepted.map(o => `${fmt(o.departure_date)} ${o.airline ?? ''} ${o.seats} lugares${o.airline_price_pp ? ` a USD ${Math.round(o.airline_price_pp)} pp` : ''}`).join(' · ')}. Cargar en HUB: ${SYSTEM_URL}/flights/pedidos/${id}` }).catch(() => null)
    }
    await logEvent(db, { source: 'cupos', action: 'cupo_request.confirmed', message: `Pedido #${id} confirmado con ${accepted.length} tirada(s)`, entityType: 'cupo_request', entityId: id }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, accepted: accepted.length })
  } catch (error) {
    return errorResponse(error)
  }
}
