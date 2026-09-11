import {
  TRACK_PATH,
  isMetaEvent,
  type MetaTrackEvent,
  type TrackBeacon,
  type TrackEvent,
  type TrackPayload,
} from './tracking'

/**
 * El emisor de eventos de la landing (navegador).
 *
 * Un solo camino para las dos puntas: el `dataLayer` (GTM → GA4 + pixel) y el
 * beacon a la Conversions API, con el MISMO `event_id` para que Meta dedupe
 * el evento del navegador contra el del servidor. Nada de esto puede romper
 * la página: un bloqueador de anuncios, un `dataLayer` ausente o un
 * `sendBeacon` que falla tienen que terminar en silencio.
 *
 * Usa `window`: importar sólo desde componentes cliente.
 */

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>
  }
}

/** Id del evento, compartido por el pixel y la CAPI. */
export function newEventId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch {
    // Contextos sin `crypto` (o con la API capada): vale el id de respaldo.
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Valor de una cookie dentro de un `document.cookie`; null si no está. */
export function readCookie(name: string, cookie: string): string | null {
  for (const parte of cookie.split(';')) {
    const igual = parte.indexOf('=')
    if (igual < 0) continue
    if (parte.slice(0, igual).trim() !== name) continue
    const valor = parte.slice(igual + 1).trim()
    try {
      return decodeURIComponent(valor)
    } catch {
      // Cookie mal escapada por otro script: mejor el valor crudo que nada.
      return valor
    }
  }
  return null
}

/**
 * `fbclid` de la URL → `fb.1.${now}.${fbclid}`, el formato oficial de `_fbc`.
 *
 * Es el respaldo para el primer click de una campaña: el pixel todavía no
 * escribió la cookie `_fbc` cuando el visitante dispara el `ViewContent`.
 */
export function fbcFromUrl(url: string, now: number): string | null {
  try {
    const fbclid = new URL(url).searchParams.get('fbclid')
    return fbclid ? `fb.1.${now}.${fbclid}` : null
  } catch {
    return null
  }
}

/** Arma el body del beacon. `fbc` sale de la cookie `_fbc` o, si no está, del `fbclid` de la URL. */
export function buildBeacon(
  event: MetaTrackEvent,
  eventId: string,
  payload: TrackPayload,
  ctx: { href: string; cookie: string; now: number }
): TrackBeacon {
  const beacon: TrackBeacon = { event, event_id: eventId, payload }
  if (ctx.href) beacon.url = ctx.href
  const fbp = readCookie('_fbp', ctx.cookie)
  if (fbp) beacon.fbp = fbp
  const fbc = readCookie('_fbc', ctx.cookie) ?? fbcFromUrl(ctx.href, ctx.now)
  if (fbc) beacon.fbc = fbc
  return beacon
}

/**
 * Empuja el evento al `dataLayer` (GTM → GA4 + pixel) y, si es un evento de
 * Meta, manda el beacon a `/api/vuelos-baratos/track` para la Conversions API
 * con el mismo `event_id`.
 *
 * Nunca lanza: si no hay `window`, `dataLayer` o `navigator`, sigue en
 * silencio. Devuelve el `event_id`.
 */
export function track(event: TrackEvent, payload: TrackPayload): string {
  const eventId = newEventId()
  try {
    // SSR: el id igual sirve (el componente lo vuelve a disparar al montar).
    if (typeof window === 'undefined') return eventId

    window.dataLayer = window.dataLayer || []
    window.dataLayer.push({ event, event_id: eventId, ...payload })

    if (!isMetaEvent(event)) return eventId

    const body = JSON.stringify(
      buildBeacon(event, eventId, payload, {
        href: window.location?.href ?? '',
        cookie: typeof document === 'undefined' ? '' : document.cookie,
        now: Date.now(),
      })
    )

    // `sendBeacon` sobrevive a la navegación del click "Seleccionar" (que abre
    // otra pestaña pero igual puede descargar la actual); `fetch` con
    // `keepalive` es el respaldo donde no existe o devuelve false (cola llena).
    const enviado =
      typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function'
        ? navigator.sendBeacon(TRACK_PATH, new Blob([body], { type: 'application/json' }))
        : false

    if (!enviado) {
      void fetch(TRACK_PATH, {
        method: 'POST',
        keepalive: true,
        headers: { 'content-type': 'application/json' },
        body,
      }).catch(() => {})
    }
  } catch {
    // El tracking nunca puede tumbar la landing.
  }
  return eventId
}
