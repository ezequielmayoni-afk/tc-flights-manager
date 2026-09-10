/**
 * Constantes de vuelos.siviajo.com (landing pública de "vuelos baratos a X").
 *
 * El barrido nocturno sondea siviajo.com vía el cotizador-bot y guarda las
 * observaciones; las páginas leen agregados. Todo lo que se toca para calibrar
 * el freno look-to-book (cuántas sondas, con cuánta anticipación, con qué
 * prioridad) vive acá.
 */

/** Una observación sirve para mostrar precio hasta 48 h después. */
export const OBSERVATION_WINDOW_HOURS = 48
export const DEFAULT_ADULTS = 1
/** El cotizador tiene un solo worker: dos sondas en vuelo como mucho. */
export const PROBE_CONCURRENCY = 2
export const PROBE_RETRY_DELAY_MS = 5_000
/** No se sondea nada con menos de 3 días de anticipación (no es tarifa de landing). */
export const MIN_LEAD_DAYS = 3
export const SWEEP_ENQUEUE_HOUR_UTC = 1
/** Las estimaciones de Sabre se encolan una hora antes que el plan del barrido. */
export const ESTIMATE_ENQUEUE_HOUR_UTC = 0
/** Una estimación sirve para planificar el barrido de esa noche (y la mañana siguiente). */
export const ESTIMATE_WINDOW_HOURS = 30
/** Meses por job de estimación: la sesión de Sabre busca de a un par por vez. */
export const ESTIMATE_MONTHS_PER_JOB = 2
/** Itinerarios que Sabre devuelve (y que se guardan resumidos) por par de fechas. */
export const SABRE_MAX_ITINERARIES = 5
/**
 * Menor que las ideas (5) incluso con el +1 de los primeros meses (3 + 1 = 4):
 * las cotizaciones reales ganan la noche.
 */
export const SWEEP_PRIORITY = 3
/**
 * Las estimaciones van por encima del barrido (y por el lane `sabre`, que es
 * suyo): tienen que estar guardadas antes de que el plan del barrido decida
 * qué fechas confirmar, una hora después.
 */
export const ESTIMATE_PRIORITY = 5
/** El tick del cron corta a los ~8 min, así que un job hace hasta 10 sondas. */
export const MAX_PROBES_PER_JOB = 10
export const PUBLIC_CACHE_TTL_MS = 10 * 60_000
export const PAGE_SIZE = 30
export const SLUG_RE = /^[a-z0-9-]{2,40}$/

export interface Origin {
  /** Código de DESTINO de Travel Compositor (no es el IATA del aeropuerto). */
  code: string
  name: string
  slug: string
  /** IATA de ciudad para Sabre: los códigos TC (CRD, RO6, MEZ) no le sirven. */
  iata: string
}

export const ORIGINS: Origin[] = [
  { code: 'BUE', name: 'Buenos Aires', slug: 'buenos-aires', iata: 'BUE' },
  { code: 'CRD', name: 'Córdoba', slug: 'cordoba', iata: 'COR' },
  { code: 'RO6', name: 'Rosario', slug: 'rosario', iata: 'ROS' },
  { code: 'MEZ', name: 'Mendoza', slug: 'mendoza', iata: 'MDZ' },
]

export const DEFAULT_ORIGIN = 'BUE'

export function originByCode(code: string | null | undefined): Origin | null {
  if (!code) return null
  const buscado = code.trim().toUpperCase()
  return ORIGINS.find((o) => o.code === buscado) ?? null
}

/**
 * El IATA que entiende Sabre para un origen del barrido; null si el código no
 * es uno de los nuestros (mandarle un TC como 'RO6' es un error de programación,
 * no una búsqueda vacía).
 */
export function originIata(code: string | null | undefined): string | null {
  return originByCode(code)?.iata ?? null
}

const BASE_PUBLICA_DEFAULT = 'https://vuelos.siviajo.com'

function sinBarraFinal(value: string | undefined, fallback: string): string {
  const raw = (value ?? '').trim() || fallback
  return raw.replace(/\/+$/, '')
}

/** Base pública de la landing (para canonicals, sitemap y JSON-LD). */
export function publicBaseUrl(): string {
  return sinBarraFinal(process.env.NEXT_PUBLIC_VUELOS_BASE_URL, BASE_PUBLICA_DEFAULT)
}

/**
 * La misma base como `URL`, para el `metadataBase` del layout.
 *
 * `new URL` tira si la variable quedó mal escrita ('vuelos.siviajo.com' sin
 * esquema, por ejemplo) y ahí se cae el módulo entero al importarlo: mejor
 * volver al default que dejar la landing sin responder.
 */
export function publicBaseUrlObject(): URL {
  try {
    return new URL(publicBaseUrl())
  } catch {
    return new URL(BASE_PUBLICA_DEFAULT)
  }
}

/** Base del motor de reservas al que apuntan los deep links. */
export function siviajoBaseUrl(): string {
  return sinBarraFinal(process.env.SIVIAJO_BASE_URL, 'https://www.siviajo.com')
}
