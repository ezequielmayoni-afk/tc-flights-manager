import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateBrandCopies } from '@/lib/marketing/copy/generate'
import { ANGLES } from '@/lib/marketing/brand'

export const dynamic = 'force-dynamic'
export const maxDuration = 180

const schema = z.object({ packageId: z.number().int().positive(), variants: z.array(z.number().int().min(1).max(5)).optional() })

/** POST /api/marketing/copy { packageId, variants? } — genera los copys con la voz de marca (un ángulo por variante) y los guarda. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const parsed = schema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST('packageId (número)')
    const db = createAdminClient()
    const angles = parsed.data.variants?.length ? ANGLES.filter(a => parsed.data.variants!.includes(a.variant)) : undefined
    const r = await generateBrandCopies(db, parsed.data.packageId, { angles, actor: user?.email ?? 'ui' })
    await logEvent(db, { source: 'marketing', action: 'marketing.copies_generated', message: `${r.saved.length} copy(s) con voz de marca para el paquete ${parsed.data.packageId}${r.rejected.length ? `; ${r.rejected.length} rechazado(s) por QA` : ''}`, entityType: 'package', entityId: parsed.data.packageId, details: { model: r.model, rejected: r.rejected, fixed: r.fixed } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, ...r })
  } catch (error) {
    return errorResponse(error)
  }
}
