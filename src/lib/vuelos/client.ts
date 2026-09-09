import { recordExternalCall } from '@/lib/jobs/budget'
import { setIntegrationStatus } from '@/lib/jobs/integrations'
import type { Db } from '@/lib/jobs/types'
import type { FareCell } from '@/lib/producto/types'

/**
 * Cliente de vuelos-siviajo (matrix de precios sobre el buscador de
 * siviajo.com + Sabre). Sin VUELOS_URL configurada no hay servicio (hoy
 * corre sólo en Docker local): los jobs que lo necesitan quedan omitidos
 * con motivo y el cotizador elige la fecha solo.
 *
 * Ojo con las fechas: /api/search, /api/quote y /api/matrix usan dd/M/yyyy;
 * /api/availability usa yyyy-MM-dd.
 */

export const VUELOS_PROVIDER = 'vuelos'
const POLL_MS = 3_000
const MATRIX_TIMEOUT_MS = 150_000

export function isVuelosConfigured(): boolean {
  return Boolean(process.env.VUELOS_URL)
}

function baseUrl(): string {
  const url = process.env.VUELOS_URL
  if (!url) throw new Error('VUELOS_URL no está configurada (vuelos-siviajo no está desplegado)')
  return url.replace(/\/$/, '')
}

/** yyyy-mm-dd → dd/M/yyyy (sin ceros a la izquierda en el mes, como espera el servicio). */
export function toVuelosDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d}/${m}/${y}`
}

/** dd/M/yyyy o yyyy-mm-dd → yyyy-mm-dd */
export function fromVuelosDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const [d, m, y] = value.split('/').map(Number)
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export interface MatrixCell { dep_date: string; ret_date: string | null; min_price: number | null; flight_count: number; status: string }
export interface MatrixResult { id: string; origin_code: string; dest_code: string; base_date: string; status: string; cells: MatrixCell[] }

async function call<T>(db: Db, path: string, init: RequestInit, jobId: number | null, endpoint: string, timeoutMs = 30_000): Promise<T> {
  const started = Date.now()
  let status: 'ok' | 'error' | 'timeout' = 'ok'
  try {
    const res = await fetch(`${baseUrl()}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) }, signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) { status = 'error'; throw new Error(`vuelos ${res.status} en ${path}`) }
    return (await res.json()) as T
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') status = 'timeout'
    else if (status === 'ok') status = 'error'
    throw err
  } finally {
    await recordExternalCall(db, { provider: VUELOS_PROVIDER, endpoint, units: 1, status, durationMs: Date.now() - started, jobId })
  }
}

/**
 * Mapa de precios ±7 días alrededor de una fecha (15 celdas). Para un mes
 * entero se piden dos: día 8 y día 23.
 */
export async function getMatrix(db: Db, input: { origin: string; destination: string; baseDate: string; tripDays?: number; cabinClass?: 'economy' | 'business' }, jobId: number | null = null): Promise<MatrixResult> {
  const start = await call<{ matrix_id: string }>(db, '/api/matrix', {
    method: 'POST',
    body: JSON.stringify({ origin: input.origin, destination: input.destination, base_date: toVuelosDate(input.baseDate), trip_days: input.tripDays ?? null, cabin_class: input.cabinClass ?? 'economy' }),
  }, jobId, 'matrix.start')
  const deadline = Date.now() + MATRIX_TIMEOUT_MS
  while (Date.now() < deadline) {
    const result = await call<MatrixResult>(db, `/api/matrix/${start.matrix_id}`, { method: 'GET' }, jobId, 'matrix.poll')
    if (result.status === 'done' || result.status === 'error') {
      await setIntegrationStatus(db, 'vuelos', { status: result.status === 'done' ? 'ok' : 'degraded', details: { last: 'matrix', matrixId: start.matrix_id } })
      return result
    }
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  throw new Error('vuelos: el matrix no terminó a tiempo')
}

/** Celdas del matrix → calendario de precios del módulo Producto. */
export function matrixToFareCells(result: MatrixResult): FareCell[] {
  return result.cells
    .filter(c => c.status === 'done' && c.min_price !== null && c.min_price > 0)
    .map(c => ({
      date: fromVuelosDate(c.dep_date),
      pricePerPax: Number(c.min_price),
      currency: 'USD',
      // El matrix no dice escalas: se asume "con escala" y el cotizador confirma.
      direct: false,
      durationMinutes: null,
      airline: null,
      source: 'tc_search' as const,
    }))
}

export interface QuickQuoteFlight {
  airline: string | null
  flight_number: string | null
  departure_time: string | null
  arrival_time: string | null
  duration_min: number | null
  stops: string | number | null
  price_usd: number | null
  fare_type: string | null
  baggage: string | null
}

/** Vuelos para una fecha concreta (una llamada, ~30–55 s en frío). */
export async function quickQuote(db: Db, input: { origin: string; destination: string; departureDate: string; returnDate?: string; cabinClass?: 'economy' | 'business' }, jobId: number | null = null): Promise<{ flights: QuickQuoteFlight[]; searchId: string | null }> {
  const body = await call<{ status: string; search_id?: string; flights?: QuickQuoteFlight[] }>(db, '/api/quote', {
    method: 'POST',
    body: JSON.stringify({
      origin: input.origin,
      destination: input.destination,
      departure_date: toVuelosDate(input.departureDate),
      return_date: input.returnDate ? toVuelosDate(input.returnDate) : undefined,
      trip_type: input.returnDate ? 'ROUND_TRIP' : 'ONE_WAY',
      cabin_class: input.cabinClass ?? 'economy',
    }),
  }, jobId, 'quote', 70_000)
  return { flights: body.flights ?? [], searchId: body.search_id ?? null }
}

export function stopsToNumber(stops: string | number | null): number | null {
  if (stops === null || stops === undefined) return null
  if (typeof stops === 'number') return stops
  if (/directo/i.test(stops)) return 0
  const m = /(\d+)/.exec(stops)
  return m ? Number(m[1]) : null
}
