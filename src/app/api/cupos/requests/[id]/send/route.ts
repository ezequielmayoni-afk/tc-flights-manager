import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'
import { buildCupoRequestMessage, sendSlackMessage } from '@/lib/slack/client'

export const dynamic = 'force-dynamic'
const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'

/** POST — manda el pedido a aéreos: fija el plazo (SLA), publica en Slack y marca las tiradas como pedidas. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const { request, options } = loaded
    if (!['ready', 'draft', 'sent'].includes(request.status)) throw API_ERRORS.BAD_REQUEST(`El pedido está ${request.status}`)
    const toSend = options.filter(o => o.status === 'probed' || o.status === 'requested')
    if (toSend.length === 0) throw API_ERRORS.BAD_REQUEST('No hay tiradas para pedir: armalas primero')
    const { data: settings } = await db.from('notification_settings').select('slack_enabled, slack_webhook_url, slack_channel_aereos, cupo_request_sla_hours').eq('id', 1).maybeSingle()
    const slaHours = Number(settings?.cupo_request_sla_hours ?? 72)
    const now = new Date()
    const deadline = new Date(now.getTime() + slaHours * 3600000)
    const actor = user?.email ?? 'ui'
    let slackTs: string | null = request.slack_message_ts
    let slackNote = 'sin Slack configurado'
    if (settings?.slack_enabled && settings.slack_webhook_url) {
      const msg = buildCupoRequestMessage({ requestId: id, title: request.title, originCode: request.origin_code, destinationName: request.destination_name, nights: request.nights, seats: request.seats_requested, adults: request.adults, deadlineLabel: deadline.toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }), options: toSend.map(o => ({ rank: o.rank, departureDate: o.departure_date, returnDate: o.return_date, airline: o.airline, flightOut: o.flight_out, flightBack: o.flight_back, direct: o.direct, systemPricePp: o.system_price_pp })), notes: request.notes, systemUrl: SYSTEM_URL })
      const r = await sendSlackMessage(settings.slack_webhook_url, msg)
      slackTs = r.ts ?? slackTs
      slackNote = r.ok ? `publicado en ${settings.slack_channel_aereos || '#aereos'}` : `Slack falló: ${r.error}`
    }
    await db.from('cupo_request_options').update({ status: 'requested', updated_at: now.toISOString() }).eq('request_id', id).eq('status', 'probed')
    await db.from('cupo_requests').update({ status: 'sent', sent_at: request.sent_at ?? now.toISOString(), sent_by: request.sent_by ?? actor, response_deadline_at: deadline.toISOString(), slack_message_ts: slackTs, updated_at: now.toISOString() }).eq('id', id)
    await logEvent(db, { source: 'cupos', action: 'cupo_request.sent', message: `Pedido #${id} enviado a aéreos (${toSend.length} tiradas, plazo ${slaHours} h, ${slackNote})`, entityType: 'cupo_request', entityId: id, details: { slaHours, deadline: deadline.toISOString(), slackNote } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, deadline: deadline.toISOString(), slack: slackNote })
  } catch (error) {
    return errorResponse(error)
  }
}
