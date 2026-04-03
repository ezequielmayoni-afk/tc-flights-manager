import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * GET /api/vendedores/dates
 * Returns all vendedor dates (fecha_alta, fecha_baja)
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('vendedores')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()
  const { data, error } = await db
    .from('vendedor_dates')
    .select('nombre, fecha_alta, fecha_baja')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ dates: data || [] })
}

/**
 * POST /api/vendedores/dates
 * Upsert a vendedor's dates
 * Body: { nombre, fecha_alta?, fecha_baja? }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('vendedores')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { nombre, fecha_alta, fecha_baja } = await request.json()

  if (!nombre) {
    return NextResponse.json({ error: 'nombre is required' }, { status: 400 })
  }

  const db = createAdminClient()
  const { error } = await db
    .from('vendedor_dates')
    .upsert({
      nombre,
      fecha_alta: fecha_alta || null,
      fecha_baja: fecha_baja || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'nombre' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
