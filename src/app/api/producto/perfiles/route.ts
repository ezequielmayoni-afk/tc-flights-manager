import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createProfile, findProfileByText, loadProfiles, type NewProfileInput } from '@/lib/producto/profiles'

export const dynamic = 'force-dynamic'

const EDITABLE = ['review_pending', 'name', 'aliases', 'family', 'tc_destination_code', 'iata_airport', 'cotizador_instance', 'regimen_required', 'regimen_allowed', 'nights_default', 'nights_allowed', 'stars_default', 'stars_min', 'high_season_months', 'booking_window_days', 'stopover_threshold_pct', 'stopover_modifiers', 'airlines_by_origin', 'themes_default', 'direct_required', 'auto_publish', 'auto_requote', 'price_tolerance_pct', 'trend_slug', 'active', 'notes']

/** GET /api/producto/perfiles            → todos
 *  GET /api/producto/perfiles?match=texto → el perfil que corresponde a un destino (o null) */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const match = request.nextUrl.searchParams.get('match')
    if (match) {
      const profiles = await loadProfiles(db)
      const profile = findProfileByText(profiles, match)
      return NextResponse.json({ profile })
    }
    const { data, error } = await db.from('destination_profiles').select('*').order('family').order('name')
    if (error) throw new Error(error.message)
    return NextResponse.json({ profiles: data ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

/** POST /api/producto/perfiles — alta rápida (desde Tendencias); queda pendiente de revisión. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const body = await request.json() as NewProfileInput
    if (!body.name?.trim() || !body.family) return NextResponse.json({ error: 'name y family son obligatorios' }, { status: 400 })
    const db = createAdminClient()
    const profile = await createProfile(db, { ...body, created_by: user?.email ?? null, created_from: body.created_from ?? 'tendencias' })
    await logEvent(db, { source: 'automation', action: 'profile.created', message: `Perfil ${profile.code} (${profile.name}) creado desde ${body.created_from ?? 'tendencias'}, pendiente de revisión`, details: { code: profile.code } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true, profile })
  } catch (error) {
    return errorResponse(error)
  }
}

/** PATCH /api/producto/perfiles { code, ...campos } */
export async function PATCH(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const body = await request.json() as Record<string, unknown>
    const code = String(body.code ?? '')
    if (!code) return NextResponse.json({ error: 'code obligatorio' }, { status: 400 })
    const patch = Object.fromEntries(Object.entries(body).filter(([k]) => EDITABLE.includes(k)))
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    const db = createAdminClient()
    const { error } = await db.from('destination_profiles').update({ ...patch, updated_at: new Date().toISOString() }).eq('code', code)
    if (error) throw new Error(error.message)
    await logEvent(db, { source: 'automation', action: 'profile.updated', message: `Perfil ${code} actualizado: ${Object.keys(patch).join(', ')}`, details: { code, patch } }, user ? { id: user.id, email: user.email } : null)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return errorResponse(error)
  }
}
