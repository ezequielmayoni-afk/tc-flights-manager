import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { resolveDestination } from '@/lib/cotizador/client'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vuelos-baratos/resolve — traduce un texto libre al código de
 * destino de Travel Compositor.
 *
 * Se usa al dar de alta un destino o una ruta: antes de encolar un barrido
 * conviene saber que "Florianópolis" resuelve a FLO. No resolver no es un
 * error: viene 200 con `status: 'no_resuelto'` y el motivo.
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = (await request.json().catch(() => null)) as { query?: unknown } | null
    const query = typeof body?.query === 'string' ? body.query.trim() : ''
    if (query.length < 2 || query.length > 80) throw API_ERRORS.BAD_REQUEST('query debe tener entre 2 y 80 caracteres')

    const result = await resolveDestination(createAdminClient(), query)
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}
