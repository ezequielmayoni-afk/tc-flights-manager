import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidatePublicCache } from '@/lib/vuelos-baratos/cache'
import { createRoute, listRoutes } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

/** Mismos topes que los CHECK de la tabla y que el PATCH de `routes/[id]`. */
const createSchema = z.object({
  destination_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, 'código de destino inválido'),
  origin_tc_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/, 'código de origen de TC inválido'),
  origin_name: z.string().trim().min(2).max(80),
  stay_nights: z.array(z.number().int().min(1).max(30)).min(1).max(6).optional(),
  weekdays: z.array(z.number().int().min(1).max(7)).max(7).optional(),
  probes_per_month: z.number().int().min(1).max(31).optional(),
  months_ahead: z.number().int().min(1).max(18).optional(),
  active: z.boolean().optional(),
})

/** GET /api/vuelos-baratos/routes?destination= — rutas del barrido. */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const destinationCode = request.nextUrl.searchParams.get('destination')?.trim().toUpperCase() || undefined
    return NextResponse.json({ routes: await listRoutes(createAdminClient(), { destinationCode }) })
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * POST /api/vuelos-baratos/routes — suma un origen al barrido de un destino.
 * Nace apagada salvo que se pida lo contrario: prenderla es lo que gasta.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))

    const db = createAdminClient()
    const route = await createRoute(db, { ...parsed.data, active: parsed.data.active ?? false })
    invalidatePublicCache()

    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.route_created',
        message: `Ruta ${route.origin_tc_code}→${route.destination_code} creada (${route.active ? 'activa' : 'apagada'})`,
        details: { routeId: route.id, route },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json(route, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
