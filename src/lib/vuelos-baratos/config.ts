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
/** Menor que las ideas (5): las cotizaciones reales ganan la noche. */
export const SWEEP_PRIORITY = 4
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
}

export const ORIGINS: Origin[] = [
  { code: 'BUE', name: 'Buenos Aires', slug: 'buenos-aires' },
  { code: 'CRD', name: 'Córdoba', slug: 'cordoba' },
  { code: 'RO6', name: 'Rosario', slug: 'rosario' },
  { code: 'MEZ', name: 'Mendoza', slug: 'mendoza' },
]

export const DEFAULT_ORIGIN = 'BUE'

export function originByCode(code: string | null | undefined): Origin | null {
  if (!code) return null
  const buscado = code.trim().toUpperCase()
  return ORIGINS.find((o) => o.code === buscado) ?? null
}

function sinBarraFinal(value: string | undefined, fallback: string): string {
  const raw = (value ?? '').trim() || fallback
  return raw.replace(/\/+$/, '')
}

/** Base pública de la landing (para canonicals, sitemap y JSON-LD). */
export function publicBaseUrl(): string {
  return sinBarraFinal(process.env.NEXT_PUBLIC_VUELOS_BASE_URL, 'https://vuelos.siviajo.com')
}

/** Base del motor de reservas al que apuntan los deep links. */
export function siviajoBaseUrl(): string {
  return sinBarraFinal(process.env.SIVIAJO_BASE_URL, 'https://www.siviajo.com')
}
