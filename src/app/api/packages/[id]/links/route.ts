import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { loadPackageLinks, refreshFlightPackageLinks, setLinkDecision } from '@/lib/cupos/links'

type RouteParams = { params: Promise<{ id: string }> }

/** GET /api/packages/[id]/links — vínculos cupo ↔ paquete con cupos actuales. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const packageId = Number(id)
    if (!packageId) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const db = createAdminClient()
    const links = await loadPackageLinks(db, [packageId])
    return NextResponse.json({ links: links.get(packageId) ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * PATCH /api/packages/[id]/links  { linkId, decision: 'confirm' | 'reject' } | { refresh: true }
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const { id } = await params
    const packageId = Number(id)
    if (!packageId) return NextResponse.json({ error: 'id inválido' }, { status: 400 })
    const body = await request.json().catch(() => ({})) as { linkId?: number; decision?: 'confirm' | 'reject'; refresh?: boolean }
    const db = createAdminClient()
    if (body.refresh) {
      const r = await refreshFlightPackageLinks(db, [packageId])
      return NextResponse.json({ ok: true, ...r })
    }
    if (!body.linkId || (body.decision !== 'confirm' && body.decision !== 'reject')) {
      return NextResponse.json({ error: 'linkId y decision (confirm|reject) son obligatorios' }, { status: 400 })
    }
    await setLinkDecision(db, body.linkId, body.decision, user?.email ?? null)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
