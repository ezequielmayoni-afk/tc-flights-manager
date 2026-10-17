import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

const schema = z.object({
  airlineCode: z.string().trim().min(1).max(4).transform(s => s.toUpperCase()).optional(),
  airlineName: z.string().trim().min(2).max(80).optional(),
  contactName: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().email().max(120).optional(),
  ccEmails: z.array(z.string().trim().email()).max(5).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().optional(),
})

export async function PATCH(request: NextRequest, { params }: Params) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const row: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user?.email ?? null }
    if (p.airlineCode !== undefined) row.airline_code = p.airlineCode
    if (p.airlineName !== undefined) row.airline_name = p.airlineName
    if (p.contactName !== undefined) row.contact_name = p.contactName
    if (p.email !== undefined) row.email = p.email.toLowerCase()
    if (p.ccEmails !== undefined) row.cc_emails = p.ccEmails.map(e => e.toLowerCase())
    if (p.phone !== undefined) row.phone = p.phone
    if (p.notes !== undefined) row.notes = p.notes
    if (p.active !== undefined) row.active = p.active
    const db = createAdminClient()
    const { error } = await db.from('airline_contacts').update(row).eq('id', id)
    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const { data: c } = await db.from('airline_contacts').select('airline_name, email').eq('id', id).maybeSingle()
    const { error } = await db.from('airline_contacts').delete().eq('id', id)
    if (error) throw new Error(error.message)
    if (c) await logEvent(db, { source: 'cupos', action: 'airline_contact.deleted', message: `Contacto borrado: ${c.airline_name} ${c.email}` }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
