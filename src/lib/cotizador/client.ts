import { recordExternalCall } from '@/lib/jobs/budget'
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
