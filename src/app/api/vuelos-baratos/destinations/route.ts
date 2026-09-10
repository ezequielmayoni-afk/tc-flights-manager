import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { invalidatePublicCache } from '@/lib/vuelos-baratos/cache'
import { createLandingDestination, createRoute, listLandingDestinations } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

const CODE_RE = /^[A-Z0-9]{2,10}$/
const text = (max: number) => z.string().trim().max(max).transform(v => v || null).nullable().optional()

const createSchema = z.object({
  /** Código del perfil en `destination_profiles`: la landing es una extensión 1:1 del perfil. */
  code: z.string().trim().toUpperCase().regex(CODE_RE, 'código de perfil inválido'),
  slug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug inválido: minúsculas, números y guiones').max(60),
  tc_code: z.string().trim().toUpperCase().regex(CODE_RE, 'código de destino de TC inválido'),
  iata_display: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, 'IATA de 3 letras').nullable().optional(),
  haul: z.enum(['short', 'medium', 'long']),
  seo_title: text(200),
  seo_description: text(400),
  hero_image_url: text(500),
  faq: z.array(z.object({ q: z.string().trim().min(1).max(300), a: z.string().trim().min(1).max(2000) })).max(20).optional(),
  active: z.boolean().optional(),
  sort_order: z.number().int().min(0).max(10_000).optional(),
  /** Crea la ruta BUE apagada con las estadías del haul, como el seed. */
  with_bue_route: z.boolean().optional(),
})

/** Estadías por defecto según distancia: el mismo criterio del seed. */
const STAY_BY_HAUL = { short: [4, 7], medium: [5, 7, 10], long: [7, 10, 14] } as const

/** GET /api/vuelos-baratos/destinations — todos los destinos de la landing (publicados o no). */
export async function GET() {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    return NextResponse.json({ destinations: await listLandingDestinations(createAdminClient()) })
  } catch (error) {
    return errorResponse(error)
  }
}

/** POST /api/vuelos-baratos/destinations — da de alta un destino en vuelos.siviajo.com. */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const parsed = createSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    const { with_bue_route, ...row } = parsed.data

    const db = createAdminClient()
    const destination = await createLandingDestination(db, {
      ...row,
      iata_display: row.iata_display ?? null,
      faq: row.faq ?? [],
      active: row.active ?? false,
      sort_order: row.sort_order ?? 100,
    })
    let route = null
    if (with_bue_route !== false) {
      route = await createRoute(db, { destination_code: destination.code, origin_tc_code: 'BUE', origin_name: 'Buenos Aires', stay_nights: [...STAY_BY_HAUL[destination.haul]], active: false })
    }
    invalidatePublicCache()

    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.destination_created',
        message: `Destino ${destination.slug} (${destination.code}) creado en la landing${route ? ' con ruta BUE apagada' : ''}`,
        details: { destination, routeId: route?.id ?? null },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json({ destination, route }, { status: 201 })
  } catch (error) {
    return errorResponse(error)
  }
}
