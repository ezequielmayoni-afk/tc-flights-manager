import { createBrowserClient } from '@supabase/ssr'
import { processLock } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/**
 * Cliente de Supabase del navegador (único por pestaña: @supabase/ssr lo cachea).
 *
 * `lock: processLock`: por defecto supabase-js usa un lock del navegador COMPARTIDO entre pestañas
 * (navigator.locks) con espera infinita. Si una pestaña queda trabada o congelada por Chrome en
 * segundo plano justo mientras renueva el token, retiene el lock y cualquier pestaña de HUB que se
 * abra o refresque espera para siempre: menú izquierdo vacío y tablas "cargando" (2026-10-23). Con
 * un lock por pestaña eso no pasa; si dos pestañas renuevan a la vez, GoTrue acepta el mismo
 * refresh token unos segundos (reuse interval) y ninguna pierde la sesión.
 */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { lock: processLock } }
  )
}
