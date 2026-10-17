import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadCupoMailSettings } from '@/lib/cupos/contacts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try { return NextResponse.json({ settings: await loadCupoMailSettings(createAdminClient()) }) } catch (error) { return errorResponse(error) }
}

const schema = z.object({
  enabled: z.boolean().optional(),
  from: z.string().trim().email().max(120).nullable().optional(),
  fromName: z.string().trim().max(80).nullable().optional(),
  cc: z.array(z.string().trim().email()).max(5).optional(),
  subjectPrefix: z.string().trim().max(80).nullable().optional(),
  signature: z.string().trim().max(1000).nullable().optional(),
  slaHours: z.number().int().min(1).max(240).optional(),
  slackChannelAereos: z.string().trim().max(60).nullable().optional(),
})

/** PATCH — casilla desde la que sale el pedido, copia interna, firma, plazo y canal de Slack de aéreos. */
export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (p.enabled !== undefined) row.cupo_mail_enabled = p.enabled
    if (p.from !== undefined) row.cupo_mail_from = p.from ? p.from.toLowerCase() : null
    if (p.fromName !== undefined) row.cupo_mail_from_name = p.fromName
    if (p.cc !== undefined) row.cupo_mail_cc = p.cc.map(e => e.toLowerCase())
    if (p.subjectPrefix !== undefined) row.cupo_mail_subject_prefix = p.subjectPrefix
    if (p.signature !== undefined) row.cupo_mail_signature = p.signature
    if (p.slaHours !== undefined) row.cupo_request_sla_hours = p.slaHours
    if (p.slackChannelAereos !== undefined) row.slack_channel_aereos = p.slackChannelAereos
    const db = createAdminClient()
    const { error } = await db.from('notification_settings').update(row).eq('id', 1)
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'cupos', action: 'cupo_mail.settings_updated', message: `Casilla de cupos actualizada (${Object.keys(row).filter(k => k !== 'updated_at').join(', ')})`, details: row }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, settings: await loadCupoMailSettings(db) })
  } catch (error) {
    return errorResponse(error)
  }
}
