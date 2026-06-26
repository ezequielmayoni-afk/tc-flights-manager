import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/auth/check
 *
 * Endpoint liviano para nginx `auth_request`: valida la sesión de HUB leyendo
 * la cookie de Supabase. 200 si hay usuario logueado, 401 si no.
 *
 * Lo usa el server block de nginx que sirve la app de video en
 * hub.siviajo.com:8095 — solo deja pasar a usuarios logueados en HUB.
 * (Mismo host que hub → la cookie de sesión se comparte entre puertos.)
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    return new NextResponse(null, { status: user ? 200 : 401 })
  } catch {
    return new NextResponse(null, { status: 401 })
  }
}
