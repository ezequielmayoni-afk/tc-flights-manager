import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import type { EnqueueResult } from '@/lib/jobs/queue'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_ORIGIN, ORIGINS, SLUG_RE, originByCode } from '@/lib/vuelos-baratos/config'
import { todayIso } from '@/lib/vuelos-baratos/date-pairs'
import { buildEstimateJobs } from '@/lib/vuelos-baratos/estimate'
import { getLandingDestinationBySlug, getRouteByCodes } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

/** Dos meses es un job: alcanza para ver si la ruta estima bien sin gastar de más. */
const MESES_DEFAULT = 2
const MESES_MAX = 12

/**
 * POST /api/vuelos-baratos/estimate — "Estimar ahora" una ruta desde la pantalla.
 *
 * Encola los mismos `flights.estimate` que el plan nocturno pero con prioridad
 * manual (el lane `sabre` no tiene ventana horaria, así que corren enseguida) y
 * aunque la ruta todavía no esté publicada. Cada par es una búsqueda BFM que se
 * cobra: por eso el default son 2 meses y no 12.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('producto')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = (await request.json().catch(() => null)) as { slug?: unknown; origin?: unknown; months?: unknown } | null

    const slug = typeof body?.slug === 'string' ? body.slug.trim().toLowerCase() : ''
    if (!SLUG_RE.test(slug)) throw API_ERRORS.BAD_REQUEST('slug obligatorio (a-z, 0-9 y guiones)')

    const origenPedido = typeof body?.origin === 'string' && body.origin.trim() ? body.origin.trim() : DEFAULT_ORIGIN
    const origen = originByCode(origenPedido)
    if (!origen) {
      throw API_ERRORS.BAD_REQUEST(`origen inválido: ${origenPedido} (válidos: ${ORIGINS.map(o => o.code).join(', ')})`)
    }
    const origin = origen.code

    const mesesPedidos = body?.months === undefined || body?.months === null ? MESES_DEFAULT : Number(body.months)
    if (!Number.isFinite(mesesPedidos) || mesesPedidos < 1) throw API_ERRORS.BAD_REQUEST('months debe ser un número entre 1 y 12')
    const months = Math.min(MESES_MAX, Math.floor(mesesPedidos))

    const db = createAdminClient()
    const destination = await getLandingDestinationBySlug(db, slug)
    if (!destination) throw API_ERRORS.NOT_FOUND(`El destino ${slug}`)

    const route = await getRouteByCodes(db, destination.code, origin)
    if (!route) throw API_ERRORS.NOT_FOUND(`La ruta ${origin}→${destination.code}`)
    // Con el estimador en 0 no hay nada que encolar: se ve mejor como 400 que
    // como "0 jobs encolados".
    if (route.scan_per_month <= 0) throw API_ERRORS.BAD_REQUEST(`La ruta ${origin}→${destination.code} tiene Sabre/mes en 0`)

    const today = new Date()
    const inputs = buildEstimateJobs({
      routes: [route],
      destinations: [destination],
      today,
      day: todayIso(today),
      monthsOverride: months,
      priority: MANUAL_PRIORITY,
      trigger: 'manual',
      // A mano se estima una ruta apagada: es como se prueba antes de publicarla.
      includeInactive: true,
    })

    const createdBy = user?.email ?? 'ui'
    const jobs: EnqueueResult[] = []
    for (const input of inputs) jobs.push(await enqueueJob(db, { ...input, createdBy }))

    const nuevos = jobs.filter(j => !j.deduped).length
    await logEvent(
      db,
      {
        source: 'automation',
        action: 'vuelos_baratos.estimate_requested',
        message: `Estimación manual ${origin}→${destination.code} (${months} ${months === 1 ? 'mes' : 'meses'}): ${nuevos} jobs encolados${jobs.length - nuevos ? `, ${jobs.length - nuevos} ya estaban` : ''}`,
        details: { slug: destination.slug, origin, months, routeId: route.id, jobs },
      },
      user ? { id: user.id, email: user.email } : null
    )

    return NextResponse.json({ ok: true, jobs })
  } catch (error) {
    return errorResponse(error)
  }
}
