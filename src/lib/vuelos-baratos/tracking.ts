import { z } from 'zod'

/**
 * Eventos de vuelos.siviajo.com: nombres, esquema del beacon y `custom_data`.
 *
 * Es isomórfico a propósito (no toca `window` ni `process.env`): lo importan el
 * cliente para armar el beacon y el endpoint para validarlo y traducirlo a la
 * Conversions API. Si el nombre de un evento o una clave de negocio cambia,
 * cambia acá y las dos puntas se enteran a la vez.
 */

export const TRACK_EVENTS = [
  'view_destination',
  'search_submit',
  'select_flight',
  'select_month',
  'filter_change',
  'change_origin',
] as const
export type TrackEvent = (typeof TRACK_EVENTS)[number]
/** El `dataLayer` lleva escalares: un objeto anidado no se puede mapear a un parámetro de GA4. */
export type TrackValue = string | number | boolean | null
export type TrackPayload = Record<string, TrackValue>

/** Eventos que además se mandan a Meta (pixel + CAPI). El resto queda sólo en GA4. */
export const META_EVENT_NAMES = {
  view_destination: 'ViewContent',
  search_submit: 'Search',
  select_flight: 'SelectFlight',
} as const
export type MetaTrackEvent = keyof typeof META_EVENT_NAMES

export const TRACK_PATH = '/api/vuelos-baratos/track'
/** UUID v4 (con guiones) o el id de respaldo `base36-base36`. */
export const EVENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/
/** Tope del body del beacon; un evento real pesa < 1 KB. */
export const MAX_BEACON_BYTES = 8192

/** Todas las rutas de la landing son el mismo "producto" para Meta. */
const CONTENT_TYPE = 'flight_route'
/** La landing publica siempre en dólares (`precio_pp` del cotizador). */
const MONEDA = 'USD'

export const trackBeaconSchema = z.object({
  event: z.enum(TRACK_EVENTS),
  event_id: z.string().regex(EVENT_ID_RE),
  url: z.string().url().max(2048).optional(),
  fbp: z.string().max(64).optional(),
  fbc: z.string().max(512).optional(),
  payload: z
    .record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()]))
    .default({}),
})
export type TrackBeacon = z.infer<typeof trackBeaconSchema>

export function isMetaEvent(event: TrackEvent): event is MetaTrackEvent {
  return Object.prototype.hasOwnProperty.call(META_EVENT_NAMES, event)
}

/** `content_ids` estable de la ruta: `${origin}-${destination}`; null si falta alguno. */
export function routeContentId(payload: TrackPayload): string | null {
  const origin = payload.origin
  const destination = payload.destination
  if (typeof origin !== 'string' || typeof destination !== 'string') return null
  if (origin === '' || destination === '') return null
  return `${origin}-${destination}`
}

/**
 * Copia las claves que de verdad vinieron en el payload.
 *
 * `null` cuenta como "no vino": Meta prefiere la clave ausente antes que vacía
 * (una clave en null cuenta como valor y ensucia los informes).
 */
function copiarPresentes(destino: Record<string, unknown>, payload: TrackPayload, claves: readonly string[]): void {
  for (const clave of claves) {
    const valor = payload[clave]
    if (valor === undefined || valor === null) continue
    destino[clave] = valor
  }
}

/** `custom_data` de Meta para cada evento. Nunca incluye claves con `undefined`. */
export function metaCustomData(event: MetaTrackEvent, payload: TrackPayload): Record<string, unknown> {
  const id = routeContentId(payload)

  if (event === 'view_destination') {
    const data: Record<string, unknown> = { content_type: CONTENT_TYPE }
    if (id) data.content_ids = [id]
    const nombre = payload.destination_name ?? payload.destination
    if (typeof nombre === 'string' && nombre !== '') data.content_name = nombre
    data.currency = MONEDA
    // El precio más barato de la ruta es el "valor" de la vista; si la página
    // salió vacía no hay `value` que mandar (un 0 diría otra cosa).
    if (typeof payload.min_price === 'number') data.value = payload.min_price
    copiarPresentes(data, payload, ['origin', 'destination'])
    return data
  }

  if (event === 'search_submit') {
    const data: Record<string, unknown> = { content_type: CONTENT_TYPE }
    if (id) {
      data.content_ids = [id]
      const depart = payload.depart
      const vuelta = payload.return
      // Solo ida (sin `return`) deja el `search_string` con la ruta sola.
      data.search_string =
        typeof depart === 'string' && typeof vuelta === 'string' ? `${id} ${depart}/${vuelta}` : id
    }
    copiarPresentes(data, payload, ['origin', 'destination', 'depart', 'return', 'adults', 'children'])
    return data
  }

  const data: Record<string, unknown> = { content_type: CONTENT_TYPE, currency: MONEDA }
  const precio = typeof payload.price_pp === 'number' ? payload.price_pp : null
  if (id) {
    data.content_ids = [id]
    data.contents = [precio === null ? { id, quantity: 1 } : { id, quantity: 1, item_price: precio }]
  }
  if (precio !== null) data.value = precio
  copiarPresentes(data, payload, ['origin', 'destination', 'depart', 'return', 'nights', 'month'])
  // `airline` es el único que puede ir en null: "sin aerolínea" (varias
  // escalas con distintas compañías) es un dato, no un hueco.
  if (payload.airline !== undefined) data.airline = payload.airline
  return data
}
