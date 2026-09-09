import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { updateLandingDestination } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

type RouteParams = { params: Promise<{ code: string }> }

/** Los códigos de `destination_profiles` son de Travel Compositor: 'MIA', 'ROE'. */
const CODE_RE = /^[A-Z0-9]{2,10}$/

/** Vacío es lo mismo que sin dato: la landing cae al texto por defecto. */
const seoText = (max: number) =>
  z
    .string()
    .max(max)
    .nullable()
    .transform(v => (v === null ? null : v.trim() || null))

/**
 * Lo que se puede cambiar de un destino publicado. El resto (slug, tc_code,
 * haul, FAQ) define la URL y el barrido: se toca por migración, no por API.
 */
const patchSchema = z.object({
  active: z.boolean().optional(),
  seo_title: seoText(200).optional(),
  seo_description: seoText(400).optional(),
})

/**
 * PATCH /api/vuelos-baratos/destinations/[code] — publica un destino en
 * vuelos.siviajo.com o le corrige el SEO.
 *
 * `active` es lo que decide si el destino aparece en la landing y si el plan
 * nocturno barre sus rutas: es el interruptor de publicación.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const code = (await params).code.trim().toUpperCase()
    if (!CODE_RE.test(code)) throw API_ERRORS.BAD_REQUEST('código de destino inválido')

    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) throw API_ERRORS.BAD_REQUEST(parsed.error.issues.map(i => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '))
    if (Object.keys(parsed.data).length === 0) throw API_ERRORS.BAD_REQUEST('No hay nada que cambiar')

    const db = createAdminClient()
    const destination = await updateLandingDestination(db, code, parsed.data)
    // Sin fila tocada el código no existe: 404, no 500.
    if (!destination) throw API_ERRORS.NOT_FOUND(`El destino ${code}`)

    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.destination_updated',
        message: `Destino ${destination.slug} actualizado (${Object.keys(parsed.data).join(', ')})`,
        details: { code, patch: parsed.data, destination },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json(destination)
  } catch (error) {
    return errorResponse(error)
  }
}
