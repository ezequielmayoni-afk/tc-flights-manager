import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadRequest } from '@/lib/cupos/requests'
import { extractReply, matchReplyToOptions } from '@/lib/cupos/reply-extract'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const schema = z.object({ text: z.string().trim().min(10).max(20000), source: z.enum(['paste', 'mail']).default('paste'), fromEmail: z.string().email().optional(), subject: z.string().max(200).optional() })

/** POST — lee una respuesta de aéreos (texto pegado) y devuelve la propuesta: precio y condiciones por tirada. No aplica nada. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const id = Number((await params).id)
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('text (mínimo 10 caracteres)')
    const db = createAdminClient()
    const loaded = await loadRequest(db, id)
    if (!loaded) throw API_ERRORS.NOT_FOUND(`El pedido ${id}`)
    const { data: replyRow } = await db.from('cupo_request_replies').insert({ request_id: id, source: parsed.data.source, from_email: parsed.data.fromEmail ?? null, subject: parsed.data.subject ?? null, raw_text: parsed.data.text, status: 'parsed' }).select('id').single()
    try {
      const { parsed: extracted, model } = await extractReply(loaded.request, loaded.options, parsed.data.text)
      const proposals = matchReplyToOptions(extracted, loaded.options)
      await db.from('cupo_request_replies').update({ parsed: { extracted, proposals }, model }).eq('id', replyRow!.id)
      await logEvent(db, { source: 'cupos', action: 'cupo_reply.parsed', message: `Pedido #${id}: respuesta leída (${proposals.filter(p => p.matched).length} de ${proposals.length} opciones asociadas, confianza ${extracted.confidence})`, entityType: 'cupo_request', entityId: id }, user ? { id: user.id, email: user.email } : null)
      return NextResponse.json({ ok: true, replyId: replyRow!.id, proposals, terms: extracted.terms, generalNotes: extracted.general_notes, confidence: extracted.confidence, model })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      await db.from('cupo_request_replies').update({ status: 'failed', error: message }).eq('id', replyRow!.id)
      throw new Error(`No se pudo leer la respuesta: ${message}`)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
