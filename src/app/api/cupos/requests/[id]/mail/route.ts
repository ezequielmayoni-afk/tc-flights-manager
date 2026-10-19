import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'
import { loadAirlineContacts, loadCupoMailSettings, recipientsFor } from '@/lib/cupos/contacts'
import { buildCupoRequestMail } from '@/lib/cupos/mail'

export const dynamic = 'force-dynamic'

/** GET — vista previa del mail del pedido a aéreos (asunto, texto, HTML y destinatarios). No envía nada. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const { request, options } = loaded
    const toSend = options.filter(o => o.status === 'probed' || o.status === 'requested')
    const settings = await loadCupoMailSettings(db)
    const recipients = recipientsFor(await loadAirlineContacts(db, { activeOnly: true }), toSend)
    const deadline = request.response_deadline_at ? new Date(request.response_deadline_at) : new Date(Date.now() + settings.slaHours * 3600000)
    const mail = buildCupoRequestMail({ request, options: toSend, settings, deadline, greetingName: recipients.length === 1 ? recipients[0].contact_name : null })
    return NextResponse.json({ ...mail, from: settings.from, fromName: settings.fromName, cc: settings.cc, to: recipients.map(c => ({ airline: c.airline_name, name: c.contact_name, email: c.email })), options: toSend.length })
  } catch (error) {
    return errorResponse(error)
  }
}
