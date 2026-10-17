import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadAirlineContacts } from '@/lib/cupos/contacts'

export const dynamic = 'force-dynamic'

export async function GET() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const [contacts, { data: airlines }] = await Promise.all([loadAirlineContacts(db), db.from('airlines').select('code, name').order('name')])
    return NextResponse.json({ contacts, airlines: airlines ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

const schema = z.object({
  airlineCode: z.string().trim().min(1).max(4).transform(s => s.toUpperCase()),
  airlineName: z.string().trim().min(2).max(80),
  contactName: z.string().trim().max(80).nullable().optional(),
  email: z.string().trim().email().max(120),
  ccEmails: z.array(z.string().trim().email()).max(5).default([]),
  phone: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(300).nullable().optional(),
  active: z.boolean().default(true),
})

export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const p = parsed.data
    const db = createAdminClient()
    const { data, error } = await db.from('airline_contacts').insert({ airline_code: p.airlineCode, airline_name: p.airlineName, contact_name: p.contactName ?? null, email: p.email.toLowerCase(), cc_emails: p.ccEmails.map(e => e.toLowerCase()), phone: p.phone ?? null, notes: p.notes ?? null, active: p.active, updated_by: user?.email ?? null }).select('id').single()
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'cupos', action: 'airline_contact.created', message: `Contacto de ${p.airlineName}: ${p.email}` }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
