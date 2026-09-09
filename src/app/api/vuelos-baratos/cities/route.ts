import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import { searchCities, type CityHit } from '@/lib/vuelos-baratos/cities'
import { PUBLIC_CACHE_TTL_MS } from '@/lib/vuelos-baratos/config'
import { listLandingDestinations } from '@/lib/vuelos-baratos/queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/vuelos-baratos/cities?q= — autocomplete de destinos de la landing.
 *
 * Es pública y sin sesión: la consume el buscador de vuelos.siviajo.com desde
 * el navegador. El dataset de Travel Compositor son 2.044 filas, así que vive
 * acá y no en el bundle del cliente.
 *
 * A cada ciudad que además tiene landing propia se le agrega `landingSlug`:
 * con eso el buscador decide si manda al explorador de fechas (interno) o al
 * motor de siviajo.com.
 */

interface CityResult extends CityHit {
  /** Slug de la landing si el destino está publicado; `null` si no. */
  landingSlug: string | null
}

/** `tc_code` → slug de los destinos activos. Cacheado como el resto de la landing. */
async function slugsPorCodigo(): Promise<Map<string, string>> {
  return ttlMemo('cities:landing', PUBLIC_CACHE_TTL_MS, async () => {
    const rows = await listLandingDestinations(createAdminClient(), { activeOnly: true })
    return new Map(rows.map((row) => [row.tc_code.trim().toUpperCase(), row.slug]))
  })
}

export async function GET(request: NextRequest) {
  // En Next 16 `searchParams` de la página es una promesa; en un route handler
  // se lee del request, que es sincrónico.
  const hits = searchCities(request.nextUrl.searchParams.get('q') ?? '')
  if (hits.length === 0) return respuesta([])

  // Si Supabase se cae, el autocomplete sigue funcionando sin `landingSlug`:
  // el buscador manda a siviajo.com y nadie ve un error.
  let slugs = new Map<string, string>()
  try {
    slugs = await slugsPorCodigo()
  } catch (error) {
    console.error('[vuelos-baratos] no se pudieron leer los destinos de la landing:', error)
  }

  return respuesta(hits.map((hit) => ({ ...hit, landingSlug: slugs.get(hit.code.toUpperCase()) ?? null })))
}

function respuesta(items: CityResult[]): NextResponse {
  // Una hora de caché: el dataset es estático y los destinos publicados cambian
  // a mano, no hace falta que cada tecla toque el server.
  return NextResponse.json(items, { headers: { 'Cache-Control': 'public, max-age=3600' } })
}
