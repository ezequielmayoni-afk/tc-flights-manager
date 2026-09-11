import { META_EVENT_NAMES, isMetaEvent, metaCustomData, type TrackBeacon } from '@/lib/vuelos-baratos/tracking'

/**
 * Conversions API de Meta para los eventos de vuelos.siviajo.com.
 *
 * Es el lado servidor de la deduplicación: el pixel manda el evento desde el
 * navegador (con `eventID`) y esto manda el mismo evento con el mismo
 * `event_id` desde el VPS, así Meta cuenta uno solo y los bloqueadores de
 * anuncios no se comen la conversión.
 *
 * Sin red en los tests: `sendMetaEvents` recibe el `fetch` por parámetro.
 */

/** Versión de Graph fijada a mano, como en `meta-ads/health.ts`. */
const GRAPH_VERSION = 'v21.0'
const TIMEOUT_MS = 5_000
/** Un error de Meta puede venir largo; en `system_logs` no hace falta entero. */
const MAX_ERROR_CHARS = 200

export interface MetaServerEvent {
  event_name: string
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url?: string
  user_data: { client_ip_address?: string; client_user_agent?: string; fbp?: string; fbc?: string }
  custom_data?: Record<string, unknown>
}

/**
 * El `event_source_url` lo manda el navegador: se conserva sólo si el host
 * está en `allowedHosts`, así nadie le atribuye a nuestro dataset una visita a
 * otro sitio.
 *
 * La lista tiene que salir de la configuración del servidor (la base pública),
 * NUNCA del header `Host` del pedido: ese lo elige quien llama y nginx lo
 * reenvía tal cual.
 */
function sourceUrl(raw: string | undefined, allowedHosts: string[]): string | null {
  if (!raw) return null
  const permitidos = allowedHosts.map(host => host.trim().toLowerCase()).filter(host => host !== '')
  try {
    const url = new URL(raw)
    return permitidos.includes(url.host.toLowerCase()) ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Traduce un beacon al evento de la Conversions API. Devuelve null si el
 * evento no es de Meta (sólo GA4).
 */
export function buildMetaEvent(
  beacon: TrackBeacon,
  ctx: { ip: string | null; userAgent: string | null; now: Date; allowedHosts: string[] }
): MetaServerEvent | null {
  const event = beacon.event
  if (!isMetaEvent(event)) return null

  // Las claves sin valor se omiten: Meta las cuenta como dato presente y bajan
  // la calidad de coincidencia del evento.
  const userData: MetaServerEvent['user_data'] = {}
  if (ctx.ip) userData.client_ip_address = ctx.ip
  if (ctx.userAgent) userData.client_user_agent = ctx.userAgent
  if (beacon.fbp) userData.fbp = beacon.fbp
  if (beacon.fbc) userData.fbc = beacon.fbc

  const evento: MetaServerEvent = {
    event_name: META_EVENT_NAMES[event],
    // Meta pide segundos, no milisegundos.
    event_time: Math.floor(ctx.now.getTime() / 1000),
    event_id: beacon.event_id,
    action_source: 'website',
    user_data: userData,
    custom_data: metaCustomData(event, beacon.payload),
  }

  const url = sourceUrl(beacon.url, ctx.allowedHosts)
  if (url) evento.event_source_url = url
  return evento
}

export interface SendMetaOptions {
  datasetId: string
  accessToken: string
  /** Código de "Test events" de Events Manager: verifica sin ensuciar los datos. */
  testEventCode?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}

interface RespuestaMeta {
  events_received?: number
  error?: { message?: string }
}

function parsearJson(texto: string): RespuestaMeta | null {
  try {
    return JSON.parse(texto) as RespuestaMeta
  } catch {
    return null
  }
}

/**
 * Limpia el mensaje antes de devolverlo.
 *
 * El token viaja en el body: que no se filtre al log por un mensaje de error.
 * Y el texto puede venir de Meta ecoando un valor del payload (que lo elige
 * quien llama), así que los saltos de línea se aplastan: sin eso se pueden
 * falsificar líneas enteras en el log de PM2 y en `system_logs`.
 */
function sinToken(texto: string, accessToken: string): string {
  const limpio = texto.replace(/[\r\n]+/g, ' ')
  return accessToken ? limpio.split(accessToken).join('***') : limpio
}

/** POST a graph.facebook.com. Nunca lanza; el token no aparece en el error. */
export async function sendMetaEvents(
  events: MetaServerEvent[],
  opts: SendMetaOptions
): Promise<{ ok: boolean; received: number; error?: string }> {
  const { datasetId, accessToken, testEventCode, fetchImpl = fetch, timeoutMs = TIMEOUT_MS } = opts
  if (events.length === 0) return { ok: true, received: 0 }

  const body: Record<string, unknown> = { data: events }
  if (testEventCode) body.test_event_code = testEventCode
  // El token va en el body y no en la query para que no quede en los access
  // logs de nadie.
  body.access_token = accessToken

  try {
    const response = await fetchImpl(`https://graph.facebook.com/${GRAPH_VERSION}/${datasetId}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })

    const texto = await response.text()
    const json = parsearJson(texto)

    if (!response.ok) {
      const detalle = json?.error?.message ?? texto.slice(0, MAX_ERROR_CHARS)
      return { ok: false, received: 0, error: sinToken(`HTTP ${response.status}: ${detalle}`, accessToken) }
    }

    return { ok: true, received: typeof json?.events_received === 'number' ? json.events_received : events.length }
  } catch (error) {
    const mensaje = error instanceof Error ? error.message : String(error)
    return { ok: false, received: 0, error: sinToken(mensaje, accessToken) }
  }
}
