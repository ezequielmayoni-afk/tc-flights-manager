import { NextResponse, after, type NextRequest } from 'next/server'
import { logEvent } from '@/lib/logs'
import { buildMetaEvent, sendMetaEvents } from '@/lib/meta/capi'
import { createAdminClient } from '@/lib/supabase/admin'
import { clientIp, createRateLimiter, originAllowed } from '@/lib/vuelos-baratos/beacon-guard'
import { publicBaseUrlObject } from '@/lib/vuelos-baratos/config'
import { MAX_BEACON_BYTES, trackBeaconSchema } from '@/lib/vuelos-baratos/tracking'

export const dynamic = 'force-dynamic'

/**
 * POST /api/vuelos-baratos/track — beacon de la landing hacia la CAPI de Meta.
 *
 * Es público y sin sesión (lo manda el navegador de un visitante anónimo con
 * `sendBeacon`). El camino feliz responde 204 sin cuerpo: el navegador no mira
 * la respuesta. Lo que se rechaza (403 de origen, 413 de tamaño, 400 de
 * formato, 429 de tope) sí devuelve un código propio, porque es para el que
 * depura con `curl`, no para el visitante.
 *
 * La llamada a Meta va en `after()`, después de responder: el visitante no
 * espera por graph.facebook.com.
 */

/** 120 beacons por IP cada 10 minutos: una sesión larga con muchos filtros entra cómoda. */
const MAX_BEACONS = 120
const VENTANA_MS = 10 * 60_000
/** Techo duro del limitador: una instancia de PM2 y 5.000 IPs en memoria alcanzan. */
const MAX_IPS = 5_000
const limiter = createRateLimiter({ max: MAX_BEACONS, windowMs: VENTANA_MS, maxKeys: MAX_IPS })

/** Un aviso cada 5 minutos por proceso: si Meta rechaza todo, no se llena `system_logs`. */
const AVISO_MS = 5 * 60_000
let ultimoAviso = 0

async function avisar(error: string): Promise<void> {
  console.warn('[meta-capi]', error)
  const ahora = Date.now()
  if (ahora - ultimoAviso < AVISO_MS) return
  try {
    const db = createAdminClient()
    // El throttle se marca recién acá: si falta la config de Supabase y
    // `createAdminClient()` lanza, los próximos 5 minutos no quedan mudos.
    ultimoAviso = ahora
    await logEvent(
      db,
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
  const publicHost = publicBaseUrlObject().host

  // Lo más barato primero, y antes de leer el body: un pedido de otra página
  // (o un script pelado) no llega ni a bufferear.
  if (!originAllowed(request.headers, publicHost)) return new NextResponse(null, { status: 403 })

  // `request.text()` antes que `json()`: así el tope se mide sobre lo que de
  // verdad llegó y un body gigante no pasa por el parser.
  const raw = await request.text()
  if (Buffer.byteLength(raw, 'utf8') > MAX_BEACON_BYTES) {
    return NextResponse.json({ error: 'beacon demasiado grande' }, { status: 413 })
  }

  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'beacon inválido' }, { status: 400 })
  }

  const parsed = trackBeaconSchema.safeParse(json)
  if (!parsed.success) return NextResponse.json({ error: 'beacon inválido' }, { status: 400 })

  const ip = clientIp(request.headers)
  if (!limiter.allow(ip ?? 'sin-ip', Date.now())) {
    return NextResponse.json({ error: 'demasiados eventos' }, { status: 429 })
  }

  const datasetId = process.env.META_VUELOS_DATASET_ID?.trim()
  const accessToken = process.env.META_ACCESS_TOKEN?.trim()
  if (!datasetId || !accessToken) return new NextResponse(null, { status: 204 })

  // Sólo el host de la base pública: el `Host` del pedido lo elige quien
  // llama (nginx lo reenvía tal cual), así que meterlo acá sería dejar entrar
  // cualquier `event_source_url` al dataset.
  const evento = buildMetaEvent(parsed.data, {
    ip,
    userAgent: request.headers.get('user-agent'),
    now: new Date(),
    allowedHosts: [publicHost],
  })
  // Un evento sólo de GA4 (select_month, filter_change, change_origin) llega
  // acá si alguien lo manda a mano: se responde igual y no se manda nada.
  if (!evento) return new NextResponse(null, { status: 204 })

  const testEventCode = process.env.META_CAPI_TEST_EVENT_CODE?.trim() || undefined

  after(async () => {
    const resultado = await sendMetaEvents([evento], { datasetId, accessToken, testEventCode })
    if (!resultado.ok) await avisar(resultado.error ?? 'error desconocido')
  })

  return new NextResponse(null, { status: 204 })
}
