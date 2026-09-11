import { NextResponse, after, type NextRequest } from 'next/server'
import { logEvent } from '@/lib/logs'
import { buildMetaEvent, sendMetaEvents } from '@/lib/meta/capi'
import { createAdminClient } from '@/lib/supabase/admin'
import { publicBaseUrlObject } from '@/lib/vuelos-baratos/config'
import { MAX_BEACON_BYTES, trackBeaconSchema } from '@/lib/vuelos-baratos/tracking'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vuelos-baratos/track — beacon de la landing hacia la CAPI de Meta.
 *
 * Es público y sin sesión (lo manda el navegador de un visitante anónimo con
 * `sendBeacon`), así que responde SIEMPRE 204 sin cuerpo: el navegador no
 * mira la respuesta y un error visible sólo le diría a un curioso qué
 * configuración tenemos. La llamada a Meta va en `after()`, después de
 * responder: el visitante no espera por graph.facebook.com.
 */

/** 120 beacons por IP cada 10 minutos: una sesión larga con muchos filtros entra cómoda. */
const MAX_BEACONS = 120
const VENTANA_MS = 10 * 60_000
/** Una instancia de PM2 y un `Map` en memoria alcanzan; al pasar esto se limpia lo vencido. */
const MAX_IPS = 5_000
const porIp = new Map<string, { count: number; windowStart: number }>()

/** Un aviso cada 5 minutos por proceso: si Meta rechaza todo, no se llena `system_logs`. */
const AVISO_MS = 5 * 60_000
let ultimoAviso = 0

function limitado(ip: string, ahora: number): boolean {
  const actual = porIp.get(ip)
  if (!actual || ahora - actual.windowStart >= VENTANA_MS) {
    if (porIp.size > MAX_IPS) {
      for (const [clave, valor] of porIp) {
        if (ahora - valor.windowStart >= VENTANA_MS) porIp.delete(clave)
      }
    }
    porIp.set(ip, { count: 1, windowStart: ahora })
    return false
  }
  actual.count += 1
  return actual.count > MAX_BEACONS
}

/** Detrás de nginx la IP real es la primera de `x-forwarded-for`. */
function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const primera = forwarded.split(',')[0].trim()
    if (primera) return primera
  }
  const real = request.headers.get('x-real-ip')?.trim()
  return real || null
}

function avisar(error: string): void {
  console.warn('[meta-capi]', error)
  const ahora = Date.now()
  if (ahora - ultimoAviso < AVISO_MS) return
  ultimoAviso = ahora
  try {
    void logEvent(
      createAdminClient(),
      {
        source: 'automation',
        action: 'meta.capi.error',
        level: 'warning',
        message: 'Meta CAPI rechazó un evento de vuelos.siviajo.com',
        details: { error },
      },
      null
    )
  } catch (fallo) {
    // Sin credenciales de Supabase el aviso queda sólo en la consola de PM2.
    console.warn('[meta-capi] no se pudo registrar el aviso:', fallo)
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // `request.text()` antes que `json()`: así el tope se mide sobre lo que de
  // verdad llegó y un body gigante no pasa por el parser.
  const raw = await request.text()
  if (raw.length > MAX_BEACON_BYTES) return NextResponse.json({ error: 'beacon demasiado grande' }, { status: 413 })

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'beacon inválido' }, { status: 400 })
  }

  const parsed = trackBeaconSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'beacon inválido' }, { status: 400 })

  const ip = clientIp(request)
  if (limitado(ip ?? 'sin-ip', Date.now())) return NextResponse.json({ error: 'demasiados eventos' }, { status: 429 })

  const datasetId = process.env.META_VUELOS_DATASET_ID?.trim()
  const accessToken = process.env.META_ACCESS_TOKEN?.trim()
  if (!datasetId || !accessToken) return new NextResponse(null, { status: 204 })

  // El `Host` del pedido entra a la lista para que funcione igual detrás de
  // hub.siviajo.com o en local, sin depender de que la base pública esté bien.
  const allowedHosts = [publicBaseUrlObject().host, request.headers.get('host')].filter(
    (host): host is string => Boolean(host)
  )

  const evento = buildMetaEvent(parsed.data, {
    ip,
    userAgent: request.headers.get('user-agent'),
    now: new Date(),
    allowedHosts,
  })
  // Un evento sólo de GA4 (select_month, filter_change, change_origin) llega
  // acá si alguien lo manda a mano: se responde igual y no se manda nada.
  if (!evento) return new NextResponse(null, { status: 204 })

  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim() || undefined

  after(async () => {
    const resultado = await sendMetaEvents([evento], { datasetId, accessToken, testEventCode })
    if (!resultado.ok) avisar(resultado.error ?? 'error desconocido')
  })

  return new NextResponse(null, { status: 204 })
}
