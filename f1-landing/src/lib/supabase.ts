import { createClient } from '@supabase/supabase-js'

// Cliente de solo-servidor (Server Components / route handlers). Usa la service
// role key: nunca se envía al browser. La landing solo lee catálogo y escribe
// órdenes desde el server.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

let cached: ReturnType<typeof createClient<any>> | null = null

export function db() {
  if (!url || !serviceKey) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en el entorno'
    )
  }
  if (!cached) {
    // Sin tipos generados de la BD: cliente genérico permisivo (<any>) para que
    // insert/select no infieran `never`. La landing valida datos a mano.
    cached = createClient<any>(url, serviceKey, {
      auth: { persistSession: false },
    })
  }
  return cached
}
