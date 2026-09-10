import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidatePublicCache } from '@/lib/vuelos-baratos/cache'
import { getRoute, updateRoute } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ id: string }> }

/**
 * Lo que se puede cambiar de una ruta del barrido. Los topes son los mismos
 * que los CHECK de la tabla: mejor un 400 con el motivo que un 23514 crudo.
 */
const patchSchema = z
  .object({
    active: z.boolean(),
    probes_per_month: z.number().int().min(1).max(31),
    /** Pares que estima Sabre por mes; 0 apaga el estimador de esa ruta. */
    scan_per_month: z.number().int().min(0).max(62),
    /** De los estimados, cuántos confirma el barrido con una sonda real. */
    confirm_per_month: z.number().int().min(1).max(31),
    stay_nights: z.array(z.number().int().min(1).max(30)).min(1).max(6),
    weekdays: z.array(z.number().int().min(1).max(7)).max(7),
    months_ahead: z.number().int().min(1).max(18),
  })
  .partial()

/**
 * PATCH /api/vuelos-baratos/routes/[id] — calibra el freno look-to-book.
 *
 * Es la perilla que decide cuántas llamadas al cotizador hace la noche:
 * prender una ruta, cambiarle las estadías o bajarle las sondas por mes.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const id = Number((await params).id)
    if (!Number.isInteger(id) || id <= 0) throw API_ERRORS.BAD_REQUEST('id de ruta inválido')

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    if (Object.keys(parsed.data).length === 0) throw API_ERRORS.BAD_REQUEST('No hay nada que cambiar')

    const db = createAdminClient()
    // Un id inexistente es un 404, no un 500: `updateRoute` lanza un Error
    // pelado que `errorResponse` no sabe traducir.
    if (!(await getRoute(db, id))) throw API_ERRORS.NOT_FOUND(`La ruta ${id}`)
    const route = await updateRoute(db, id, parsed.data)
    // Prender o apagar una ruta cambia lo que muestra la landing: sin esto el
    // cambio tarda hasta el TTL del memo público (10 min) en verse.
    invalidatePublicCache()

    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.route_updated',
        message: `Ruta ${route.origin_tc_code}→${route.destination_code} actualizada (${Object.keys(parsed.data).join(', ')})`,
        details: { routeId: id, patch: parsed.data, route },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json(route)
  } catch (error) {
    return errorResponse(error)
  }
}
