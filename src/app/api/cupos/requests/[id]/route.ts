import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest, waitingHours } from '@/lib/cupos/requests'
import { loadAirlineContacts, recipientsFor } from '@/lib/cupos/contacts'

export const dynamic = 'force-dynamic'
type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { authorized } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const { data: job } = loaded.request.probe_job_id ? await db.from('hub_jobs').select('id, status, last_error, finished_at').eq('id', loaded.request.probe_job_id).maybeSingle() : { data: null }
    const contacts = await loadAirlineContacts(db, { activeOnly: true })
    const recipients = recipientsFor(contacts, loaded.options).map(c => ({ id: c.id, airline: c.airline_name, name: c.contact_name, email: c.email }))
    return NextResponse.json({ ...loaded, waitingHours: waitingHours(loaded.request), probeJob: job, recipients })
  } catch (error) {
    return errorResponse(error)
  }
}

const patchSchema = z.object({
  title: z.string().trim().min(3).max(120).optional(), months: z.array(z.string().regex(/^\d{4}-\d{2}$/)).min(1).max(6).optional(), weekdays: z.array(z.number().int().min(0).max(6)).min(1).optional(),
  nights: z.number().int().min(1).max(30).optional(), seatsRequested: z.number().int().min(1).max(500).optional(), adults: z.number().int().min(1).max(9).optional(), airlinePref: z.array(z.string()).max(5).optional(),
  directOnly: z.boolean().optional(), maxOptions: z.number().int().min(3).max(12).optional(), notes: z.string().max(600).nullable().optional(), status: z.enum(['closed', 'cancelled']).optional(),
})

/** PATCH — edita el borrador (o cierra / cancela). */
export async function PATCH(request: NextRequest, { params }: Params) {
  const { authorized, user } = await checkSectionAccess('aereos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; '))
    const p = parsed.data
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const editable = ['draft', 'ready', 'probing'].includes(loaded.request.status)
    const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (p.status) row.status = p.status
    if (editable) {
      const map: Array<[keyof typeof p, string]> = [['title', 'title'], ['months', 'months'], ['weekdays', 'weekdays'], ['nights', 'nights'], ['seatsRequested', 'seats_requested'], ['adults', 'adults'], ['airlinePref', 'airline_pref'], ['directOnly', 'direct_only'], ['maxOptions', 'max_options'], ['notes', 'notes']]
      for (const [k, col] of map) if (p[k] !== undefined) row[col] = p[k]
    } else if (p.notes !== undefined) row.notes = p.notes
    const { error } = await db.from('cupo_requests').update(row).eq('id', id)
    if (error) throw new Error(error.message)
    void user
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
