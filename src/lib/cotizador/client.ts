import { getBudgetStatus, recordExternalCall } from '@/lib/jobs/budget'
import { setIntegrationStatus } from '@/lib/jobs/integrations'
import type { Db } from '@/lib/jobs/types'

/**
 * Cliente del cotizador-bot (POST /quote-multi).
 *
 * Reglas que vienen del contrato del bot: un solo worker y 3 llamadas por
 * minuto (por eso el lane `cotizador` tiene concurrencia 1 y ventana
 * nocturna); nunca devuelve un HTTP de error por un pedido malo, siempre 200
 * con `status` y `diagnostico`; con fecha flexible el presupuesto del bot
 * se duplica a 300 s, así que el timeout de acá es 330 s.
 * Dos instancias: emisivo (8090, siviajo.com) y nacional (8091, cabotaje).
 */

export type CotizadorInstance = 'emisivo' | 'nacional'
export const COTIZADOR_PROVIDER = 'cotizador'
const TIMEOUT_MS = 330_000

export interface QuoteTramo {
  destino: string
  iata_aeropuerto?: string
  noches?: number
  fecha_ida?: string
  fecha_vta?: string
  regimen?: 'all_inclusive' | 'desayuno' | 'media_pension' | 'pension_completa' | 'solo_alojamiento'
  hotel_preferido?: string
  estrellas_min?: number
}

export interface QuoteMultiRequest {
  origen: string
  mes?: string
  fecha_inicio?: string
  tramos: QuoteTramo[]
  adultos: number
  menores?: number[]
  max_opciones?: number
  vuelo_directo?: boolean
  tipo_paquete?: 'vuelo_hotel' | 'solo_vuelo' | 'solo_hotel'
  presupuesto_max_pp?: number
  flexibilidad?: 'mes' | 'quincena_1' | 'quincena_2' | 'exacta'
  rango_desde?: string
  rango_hasta?: string
}

export interface QuoteFlightLeg {
  salida?: string
  llegada?: string
  duracion?: string
  escalas?: number
  aerolinea?: string
  numeros_vuelo?: string[]
  llega_dia_siguiente?: boolean
  ruta_iata?: string
  escalas_detalle?: unknown[]
}

export interface QuoteFlight {
  aerolinea?: string
  numero_vuelo_ida?: string
  numero_vuelo_vuelta?: string
  tarifa_familia?: string
  ida?: QuoteFlightLeg
  vuelta?: QuoteFlightLeg
  equipaje?: { valija_facturada?: boolean; carry_on?: boolean; resumen?: string }
}

export interface QuoteOption {
  gama?: 'economica' | 'moderada' | 'lujo' | null
  precio_pp_final?: number
  precio_total_final?: number
  regimen_no_confirmado?: boolean
  avisos?: string[]
  hotel?: { nombre?: string; code?: string; estrellas?: number; regimen?: string; habitacion?: string; url?: string; cancelacion?: string; precio_fuente?: string; regimen_fuente?: string }
  incluye?: string[]
  vuelo?: QuoteFlight
  sin_vuelo?: boolean
}

export interface QuoteDateAlternative {
  fecha: string
  fecha_vuelta?: string
  dia?: string
  pp?: number
  duracion?: string
  escalas?: number
  tarifa?: string
  valija_facturada?: boolean
  pp_paquete?: number | null
}

export interface QuoteMultiResponse {
  status: 'ok' | 'parametros_invalidos' | 'sin_disponibilidad' | 'error_upstream' | 'timeout' | string
  diagnostico?: { motivo?: string; parametro?: string; valor_recibido?: unknown; mensaje?: string; correccion_sugerida?: string; accion_bot?: string } | null
  tipo_solicitud?: string
  moneda?: string
  elapsed_seconds?: number
  errores?: string[]
  avisos?: string[]
  viaje?: { destino?: string; noches_total?: number; fecha_ida?: string; fecha_vuelta?: string; es_caribe?: boolean }
  fechas?: { elegida?: string; vuelta?: string; dia?: string; motivo?: string; sondeadas?: number; con_vuelo?: number; alternativas?: QuoteDateAlternative[] }
  opciones?: QuoteOption[]
  /** El vuelo va a nivel raíz; `vuelo_compartido` es un booleano (true = el mismo vuelo para todas las opciones). */
  vuelo?: QuoteFlight
  vuelo_compartido?: QuoteFlight | boolean
  analisis?: { spread_pct?: number; regla_20_cumple?: boolean; recomendacion_idx?: number; recomendacion_default?: string }
}

function baseUrl(instance: CotizadorInstance): string {
  if (instance === 'nacional') return process.env.COTIZADOR_NACIONAL_URL || 'http://127.0.0.1:8091'
  return process.env.COTIZADOR_URL || 'http://127.0.0.1:8090'
}

function apiKey(instance: CotizadorInstance): string {
  const key = (instance === 'nacional' ? process.env.COTIZADOR_NACIONAL_API_KEY : undefined) || process.env.COTIZADOR_API_KEY
  if (!key) throw new Error('COTIZADOR_API_KEY no está configurada')
  return key
}

export function isCotizadorConfigured(): boolean {
  return Boolean(process.env.COTIZADOR_API_KEY)
}

/**
 * Una cotización completa. Registra la llamada en external_calls (el worker
 * se ocupó igual aunque falle) y el estado del proveedor.
 */
export async function quoteMulti(
  db: Db,
  request: QuoteMultiRequest,
  options: { instance?: CotizadorInstance; jobId?: number | null; timeoutMs?: number } = {}
): Promise<QuoteMultiResponse> {
  const instance = options.instance ?? 'emisivo'
  const started = Date.now()
  let status: 'ok' | 'error' | 'timeout' = 'ok'
  try {
    const res = await fetch(`${baseUrl(instance)}/quote-multi`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey(instance) },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(options.timeoutMs ?? TIMEOUT_MS),
    })
    if (res.status === 429) {
      status = 'error'
      throw new Error('Cotizador: límite de 3 llamadas por minuto')
    }
    const body = (await res.json().catch(() => null)) as QuoteMultiResponse | null
    if (!res.ok || !body) {
      status = 'error'
      throw new Error(`Cotizador HTTP ${res.status}`)
    }
    if (body.status === 'timeout' || body.status === 'error_upstream') status = body.status === 'timeout' ? 'timeout' : 'error'
    await setIntegrationStatus(db, 'cotizador', { status: body.status === 'error_upstream' ? 'degraded' : 'ok', details: { instance, lastStatus: body.status, elapsed: body.elapsed_seconds ?? null } })
    return body
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') status = 'timeout'
    else if (status === 'ok') status = 'error'
    await setIntegrationStatus(db, 'cotizador', { status: status === 'timeout' ? 'degraded' : 'down', details: { instance, error: err instanceof Error ? err.message : String(err) } })
    throw err
  } finally {
    await recordExternalCall(db, { provider: COTIZADOR_PROVIDER, endpoint: `${instance}:quote-multi`, units: 1, status, durationMs: Date.now() - started, jobId: options.jobId ?? null })
  }
}

// ---------------------------------------------------------------------------
// Sondas de tarifas para vuelos.siviajo.com (POST /flights/probe).
//
// Es el mismo bot pero otro endpoint y otra economía: son miles de llamadas
// por noche, cortas y baratas, así que tienen su propio proveedor de
// presupuesto (`cotizador_probe`, con tope diario y mensual) y NO tocan
// `integration_status`: mil sondas por noche serían puro ruido en el tablero.
// Nunca lanza por un error del bot: devuelve un `ProbeResult` y el job decide.
// ---------------------------------------------------------------------------

export const COTIZADOR_PROBE_PROVIDER = 'cotizador_probe'
const PROBE_TIMEOUT_MS = 60_000
/** Resolver un destino es una consulta corta: o contesta rápido o no sirve. */
const RESOLVE_TIMEOUT_MS = 20_000

export class CotizadorBudgetExhausted extends Error {
  constructor(pct: number) {
    super(`Presupuesto del cotizador (sondas) agotado (${pct}%)`)
    this.name = 'CotizadorBudgetExhausted'
  }
}

export interface ProbeInput {
  /** Código de DESTINO de Travel Compositor (BUE, CRD, RO6, MEZ), no el IATA. */
  originCode: string
  destCode: string
  departDate: string
  returnDate: string
  adults?: number
  childrenAges?: number[]
  topN?: number
  onlyDirect?: boolean
}

export interface ProbeFare {
  code: string
  name: string
  cabin: string
  price: number
  currency: string
  checkedBag: boolean | null
  carryOn: boolean | null
  refundable: boolean | null
}

export interface ProbeOption {
  pricePp: number
  currency: string
  airline: string
  flightOut: string
  flightBack: string
  departOut: string
  arriveOut: string
  departBack: string
  arriveBack: string
  durationOut: string
  durationBack: string
  durationOutMin: number | null
  durationBackMin: number | null
  /** El bot manda -1 cuando no pudo leer las escalas: acá es null. */
  stopsOut: number | null
  stopsBack: number | null
  maxLayoverH: number
  fareFamily: string
  checkedBag: boolean
  carryOn: boolean
  personalItem: boolean
  fares: ProbeFare[]
}

export type ProbeResult =
  | { status: 'ok'; options: ProbeOption[]; elapsedMs: number; originCode: string; destCode: string }
  | { status: 'empty' | 'timeout'; options: []; elapsedMs: number; originCode: string; destCode: string }
  | { status: 'error'; options: []; elapsedMs: number; error: string; httpStatus: number | null; retryable: boolean }

interface ProbeResponseBody {
  status?: string
  origen_code?: unknown
  destino_code?: unknown
  opciones?: unknown
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asBool(value: unknown): boolean {
  return value === true
}

function asBoolOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null
}

/** -1 (o cualquier cosa que no sea un entero >= 0) significa "no sé". */
function asStops(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  return Math.trunc(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** '9h 15m' → 555, '9h' → 540, '45m' → 45, '' → null. */
export function parseDurationMin(text: string | null | undefined): number | null {
  if (typeof text !== 'string') return null
  const limpio = text.trim()
  if (!limpio) return null
  const horas = /(\d+)\s*h/i.exec(limpio)
  const minutos = /(\d+)\s*m/i.exec(limpio)
  if (!horas && !minutos) return null
  return (horas ? Number(horas[1]) * 60 : 0) + (minutos ? Number(minutos[1]) : 0)
}

function mapProbeFare(raw: Record<string, unknown>): ProbeFare {
  return {
    code: asText(raw.codigo),
    name: asText(raw.nombre),
    cabin: asText(raw.cabina),
    price: asNumber(raw.precio),
    currency: asText(raw.moneda) || 'USD',
    checkedBag: asBoolOrNull(raw.valija_facturada),
    carryOn: asBoolOrNull(raw.carry_on),
    refundable: asBoolOrNull(raw.reembolsable),
  }
}

/** Una opción del bot (claves snake, todas pueden faltar) a camelCase. */
export function mapProbeOption(raw: Record<string, unknown>): ProbeOption {
  const tarifas = Array.isArray(raw.tarifas) ? raw.tarifas : []
  const duracionIda = asText(raw.duracion_ida)
  const duracionVta = asText(raw.duracion_vta)

  return {
    pricePp: asNumber(raw.precio_pp),
    currency: asText(raw.moneda) || 'USD',
    airline: asText(raw.aerolinea),
    flightOut: asText(raw.numero_vuelo_ida),
    flightBack: asText(raw.numero_vuelo_vta),
    departOut: asText(raw.salida_ida),
    arriveOut: asText(raw.llegada_ida),
    departBack: asText(raw.salida_vta),
    arriveBack: asText(raw.llegada_vta),
    durationOut: duracionIda,
    durationBack: duracionVta,
    durationOutMin: parseDurationMin(duracionIda),
    durationBackMin: parseDurationMin(duracionVta),
    stopsOut: asStops(raw.escalas_ida),
    stopsBack: asStops(raw.escalas_vta),
    maxLayoverH: asNumber(raw.espera_max_h),
    fareFamily: asText(raw.tarifa_familia),
    checkedBag: asBool(raw.valija_facturada),
    carryOn: asBool(raw.carry_on),
    personalItem: asBool(raw.bolso_de_mano),
    fares: tarifas.filter(isRecord).map(mapProbeFare),
  }
}

/** El `detail` de FastAPI si vino, si no el texto crudo. */
async function errorDetail(res: Response): Promise<string> {
  const texto = await res.text().catch(() => '')
  try {
    const body: unknown = JSON.parse(texto)
    if (isRecord(body)) {
      if (typeof body.detail === 'string') return body.detail
      if (body.detail !== undefined) return JSON.stringify(body.detail).slice(0, 300)
    }
  } catch {
    // El body no era JSON: se usa el texto crudo.
  }
  return texto.slice(0, 300) || `HTTP ${res.status}`
}

/**
 * Una sonda de tarifa (ida y vuelta) contra el cotizador emisivo.
 *
 * Devuelve siempre un `ProbeResult`; solo lanza si el presupuesto de
 * `cotizador_probe` está agotado (`CotizadorBudgetExhausted`) o si falta la
 * API key. Cada llamada queda en `external_calls` aunque falle: el bot ocupó
 * el worker igual.
 */
export async function probeFlights(
  db: Db,
  input: ProbeInput,
  options: { jobId?: number | null; timeoutMs?: number; enforceBudget?: boolean } = {}
): Promise<ProbeResult> {
  const { jobId = null, timeoutMs = PROBE_TIMEOUT_MS, enforceBudget = true } = options

  if (enforceBudget !== false) {
    const budget = await getBudgetStatus(db, COTIZADOR_PROBE_PROVIDER)
    if (budget.exhausted) throw new CotizadorBudgetExhausted(budget.pct)
  }

  const url = `${baseUrl('emisivo')}/flights/probe`
  const headers = { 'Content-Type': 'application/json', 'X-API-Key': apiKey('emisivo') }
  const body = JSON.stringify({
    origen: `Destination::${input.originCode}`,
    destino: `Destination::${input.destCode}`,
    fecha_ida: input.departDate,
    fecha_vta: input.returnDate,
    adultos: input.adults ?? 1,
    menores: input.childrenAges ?? [],
    top_n: input.topN ?? 5,
    only_direct: input.onlyDirect ?? false,
  })

  const started = Date.now()
  let registro: 'ok' | 'error' | 'timeout' = 'ok'

  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(timeoutMs) })
    const elapsedMs = Date.now() - started

    if (!res.ok) {
      registro = 'error'
      // 422 (parámetros) y 401 (API key) no mejoran reintentando.
      return {
        status: 'error',
        options: [],
        elapsedMs,
        error: await errorDetail(res),
        httpStatus: res.status,
        retryable: !(res.status === 422 || res.status === 401),
      }
    }

    const payload = (await res.json().catch(() => null)) as ProbeResponseBody | null
    if (!payload) {
      registro = 'error'
      return { status: 'error', options: [], elapsedMs, error: 'Respuesta ilegible del cotizador', httpStatus: res.status, retryable: true }
    }

    const originCode = asText(payload.origen_code) || input.originCode
    const destCode = asText(payload.destino_code) || input.destCode

    if (payload.status === 'ok') {
      const opciones = Array.isArray(payload.opciones) ? payload.opciones.filter(isRecord).map(mapProbeOption) : []
      return { status: 'ok', options: opciones, elapsedMs, originCode, destCode }
    }
    if (payload.status === 'timeout') {
      registro = 'timeout'
      return { status: 'timeout', options: [], elapsedMs, originCode, destCode }
    }
    if (payload.status === 'sin_resultados') {
      // Sin vuelos para ese par de fechas: el bot trabajó igual, se registra ok.
      return { status: 'empty', options: [], elapsedMs, originCode, destCode }
    }

    registro = 'error'
    return { status: 'error', options: [], elapsedMs, error: `Estado inesperado del cotizador: ${payload.status ?? 'sin status'}`, httpStatus: res.status, retryable: false }
  } catch (err) {
    const elapsedMs = Date.now() - started
    if (err instanceof Error && err.name === 'TimeoutError') {
      registro = 'timeout'
      return { status: 'timeout', options: [], elapsedMs, originCode: input.originCode, destCode: input.destCode }
    }
    registro = 'error'
    return { status: 'error', options: [], elapsedMs, error: err instanceof Error ? err.message : String(err), httpStatus: null, retryable: true }
  } finally {
    await recordExternalCall(db, {
      provider: COTIZADOR_PROBE_PROVIDER,
      endpoint: 'vuelos-baratos:probe',
      units: 1,
      status: registro,
      durationMs: Date.now() - started,
      jobId,
    })
  }
}

/**
 * Traduce un texto libre ("Miami", "FLN") al código de destino de Travel
 * Compositor y a su `valor_form`.
 *
 * Sirve para dar de alta rutas nuevas del barrido sin adivinar códigos: el
 * bot resuelve contra su mapa y, si hace falta, contra siviajo.com. No
 * resolver NO es un error (el bot devuelve 200 con `no_resuelto` y el
 * motivo); sí lanza si el HTTP falla o falta la API key.
 */
export async function resolveDestination(
  db: Db,
  query: string,
  options: { jobId?: number | null } = {}
): Promise<{ status: 'ok'; code: string; label: string; valorForm: string } | { status: 'no_resuelto'; motivo: string }> {
  const started = Date.now()
  let registro: 'ok' | 'error' | 'timeout' = 'ok'

  try {
    const res = await fetch(`${baseUrl('emisivo')}/flights/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey('emisivo') },
      body: JSON.stringify({ consulta: query }),
      signal: AbortSignal.timeout(RESOLVE_TIMEOUT_MS),
    })
    if (!res.ok) {
      registro = 'error'
      throw new Error(`Cotizador /flights/resolve HTTP ${res.status}: ${await errorDetail(res)}`)
    }

    const payload = (await res.json().catch(() => null)) as Record<string, unknown> | null
    if (!payload) {
      registro = 'error'
      throw new Error('Respuesta ilegible del cotizador al resolver el destino')
    }

    if (payload.status === 'ok') {
      const code = asText(payload.code)
      if (!code) {
        registro = 'error'
        throw new Error('El cotizador resolvió el destino sin código')
      }
      return { status: 'ok', code, label: asText(payload.label), valorForm: asText(payload.valor_form) || `Destination::${code}` }
    }
    return { status: 'no_resuelto', motivo: asText(payload.motivo) || `No se pudo resolver "${query}"` }
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') registro = 'timeout'
    else registro = 'error'
    throw err
  } finally {
    await recordExternalCall(db, {
      provider: COTIZADOR_PROBE_PROVIDER,
      endpoint: 'vuelos-baratos:resolve',
      units: 1,
      status: registro,
      durationMs: Date.now() - started,
      jobId: options.jobId ?? null,
    })
  }
}
