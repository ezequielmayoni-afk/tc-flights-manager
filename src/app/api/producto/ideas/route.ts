import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createIdea, type NewIdeaInput } from '@/lib/producto/ideas'

export const dynamic = 'force-dynamic'

/** GET /api/producto/ideas?status=&limit= */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const status = request.nextUrl.searchParams.get('status')
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') ?? 100), 300)
    let query = db.from('package_ideas').select('*').order('created_at', { ascending: false }).limit(limit)
    if (status) query = query.eq('status', status)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    return NextResponse.json({ ideas: data ?? [] })
  } catch (error) {
    return errorResponse(error)
  }
}

/** POST /api/producto/ideas — crea una idea (y la arranca si autoStart). */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const body = await request.json() as NewIdeaInput
    if (!body.destinationCode && !body.destinationText) return NextResponse.json({ error: 'Falta el destino' }, { status: 400 })
    const db = createAdminClient()
    const result = await createIdea(db, { ...body, createdBy: user?.email ?? 'ui' })
    return NextResponse.json({ ok: true, ...result, profile: result.profile ? { code: result.profile.code, name: result.profile.name } : null })
  } catch (error) {
    return errorResponse(error)
  }
}
