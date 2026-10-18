import { NextResponse, after, type NextRequest } from 'next/server'
import { logEvent } from '@/lib/logs'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp, createRateLimiter } from '@/lib/vuelos-baratos/beacon-guard'
import { ttlMemo } from '@/lib/vuelos-baratos/cache'
import {
  PUBLIC_CACHE_TTL_MS,
  SITE_SEARCH_ALLOWED_ORIGINS,
  SITE_SEARCH_DEDUPE_MINUTES,
  SITE_SEARCH_MAX_BYTES,
  SITE_SEARCH_PLAUSIBLE,
  SITE_SEARCH_RATE,
} from '@/lib/vuelos-baratos/config'
import { getReferencePricePp, getRoutesByCodes, hasRecentSiteSearch, insertProbe } from '@/lib/vuelos-baratos/queries'
import {
  isPlausiblePrice,
  parseSiteSearch,
  siteSearchBeaconSchema,
  siteSearchDestinationLabel,
  siteSearchOriginAllowed,
  type SiteSearch,
} from '@/lib/vuelos-baratos/site-search'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vuelos-baratos/site-search — beacon de las búsquedas reales de
 * vuelos en siviajo.com (lo manda una etiqueta de GTM en la página de
 * resultados de "solo vuelo").
 *
 * Es público, sin sesión y cross-origin: el único freno de origen posible es
 * el header `Origin`, que el navegador pone siempre en un POST cross-origin y
 * que JS no puede falsear. No frena a un `curl` decidido, pero sí a que otra
 * página escriba observaciones. Después vienen el tope por IP, el de tamaño y
 * el esquema.
 *
 * El camino feliz responde 204 sin cuerpo y escribe en `after()`: el viajero
 * no espera por la base. Un beacon válido que no es una búsqueda de ida y
 * vuelta (otra sección, fechas pasadas) también es 204: no es error de nadie.
 */

const limiter = createRateLimiter(SITE_SEARCH_RATE)

/** Un aviso cada 5 minutos por proceso: si la base rechaza todo, no se llena `system_logs`. */
const AVISO_MS = 5 * 60_000
let ultimoAviso = 0

async function avisar(error: string): Promise<void> {
  console.warn('[site-search]', error)
  const ahora = Date.now()
  if (ahora - ultimoAviso < AVISO_MS) return
  try {
    const db = createAdminClient()
    ultimoAviso = ahora
    await logEvent(
      db,
      {
        source: 'automation',
        action: 'site_search.error',
        level: 'warning',
        message: 'No se pudo guardar una búsqueda de siviajo.com',
        details: { error },
      },
      null
    )
  } catch (fallo) {
    console.warn('[site-search] no se pudo registrar el aviso:', fallo)
  }
}

/** Los headers CORS de una respuesta a un origen ya validado. */
function cors(origin: string): Record<string, string> {
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' }
}

async function guardar(s: SiteSearch): Promise<void> {
  const db = createAdminClient()
  if (await hasRecentSiteSearch(db, s, SITE_SEARCH_DEDUPE_MINUTES)) return

  const routes = await ttlMemo('site-search:routes', PUBLIC_CACHE_TTL_MS, () => getRoutesByCodes(db))
  const entrada = routes.get(`${s.origin}|${s.destinationCode}`)
  const route = entrada?.route

  // El `Origin` lo falsifica cualquier `curl` y la landing publica el mínimo:
  // un precio fuera de la banda de la referencia propia de la ruta entra como
  // 'error' (la landing sólo lee 'ok') y queda auditable con `raw.suspect`.
  let status: 'ok' | 'empty' | 'error' = s.status
  let error: string | null = null
  let suspect = false
  if (route && s.status === 'ok' && s.minPricePp !== null) {
    // Si la referencia no se puede leer (base caída un instante), la búsqueda
    // entra igual como ok: perderla es peor que el riesgo de un beacon falso.
    const ref = await getReferencePricePp(db, route.id, s.depart.slice(0, 7), SITE_SEARCH_PLAUSIBLE.refDays).catch((fallo: unknown) => {
      console.warn('[site-search] sin referencia de precio:', fallo instanceof Error ? fallo.message : fallo)
      return null
    })
    if (ref !== null && !isPlausiblePrice(s.minPricePp, ref, SITE_SEARCH_PLAUSIBLE)) {
      status = 'error'
      error = `precio fuera de rango (referencia US$ ${Math.round(ref)})`
      suspect = true
    }
  }

  await insertProbe(db, {
    route_id: route?.id ?? null,
    origin: s.origin,
    destination: siteSearchDestinationLabel(s, entrada?.destinationName ?? null),
    destination_code: s.destinationCode,
    departure_date: s.depart,
    return_date: s.return,
    nights: s.nights,
    adults: s.adults,
    price_per_pax: s.minPricePp,
    currency: 'USD',
    airline: s.airline,
    airline_code: null,
    stops: null,
    stops_back: null,
    direct: null,
    duration_minutes: null,
    duration_back_minutes: null,
    fare_family: null,
    checked_bag: null,
    carry_on: null,
    status,
    source: 'tc_search',
    options: s.options,
    // Menores e infantes no tienen columna: van acá para poder depurar.
    raw: { v: 1, results: s.results, url: s.url, children: s.children, infants: s.infants, ...(suspect ? { suspect: true } : {}) },
    error,
    probed_at: new Date().toISOString(),
    job_id: null,
    elapsed_ms: null,
  })
}

/** Último 403 avisado por consola (ms): uno por minuto alcanza para ver si siviajo.com sirve desde otro host. */
let ultimoAviso403 = 0

function rechazarOrigen(request: NextRequest): NextResponse {
  const ahora = Date.now()
  if (ahora - ultimoAviso403 > 60_000) {
    ultimoAviso403 = ahora
    console.warn('[site-search] origen rechazado', { origin: (request.headers.get('origin') ?? '').slice(0, 80) })
  }
  return new NextResponse(null, { status: 403 })
}

export async function OPTIONS(request: NextRequest): Promise<NextResponse> {
  if (!siteSearchOriginAllowed(request.headers, SITE_SEARCH_ALLOWED_ORIGINS)) return rechazarOrigen(request)
  const origin = request.headers.get('origin')!.trim().replace(/\/+$/, '')
  return new NextResponse(null, {
    status: 204,
    headers: {
      ...cors(origin),
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
    },
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // Lo más barato primero y antes de leer el body.
  if (!siteSearchOriginAllowed(request.headers, SITE_SEARCH_ALLOWED_ORIGINS)) return rechazarOrigen(request)
  const headers = cors(request.headers.get('origin')!.trim().replace(/\/+$/, ''))

  const ip = clientIp(request.headers)
  if (!limiter.allow(ip ?? 'sin-ip', Date.now())) {
    return NextResponse.json({ error: 'demasiadas búsquedas' }, { status: 429, headers })
  }

  // `text()` antes que `json()`: el tope se mide sobre lo que de verdad llegó.
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > SITE_SEARCH_MAX_BYTES) {
    return NextResponse.json({ error: 'beacon demasiado grande' }, { status: 413, headers })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'beacon inválido' }, { status: 400, headers })
  }

  const parsed = siteSearchBeaconSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'beacon inválido' }, { status: 400, headers })

  const resultado = parseSiteSearch(parsed.data, new Date())
  if (resultado.search === null) {
    console.debug('[site-search] beacon descartado:', resultado.reason)
    return new NextResponse(null, { status: 204, headers })
  }

  const busqueda = resultado.search
  after(async () => {
    try {
      await guardar(busqueda)
    } catch (err) {
      await avisar(err instanceof Error ? err.message : String(err))
    }
  })

  return new NextResponse(null, { status: 204, headers })
}
