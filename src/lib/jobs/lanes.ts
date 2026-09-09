import type { Lane } from './types'

export interface LaneConfig {
  /** Jobs de este lane que pueden correr en el mismo tick. */
  concurrency: number
  /**
   * Ventana horaria en UTC dentro de la cual corren los jobs normales. Un job
   * con priority >= MANUAL_PRIORITY la ignora (es un clic desde la UI).
   * Sin ventana = corre a cualquier hora.
   */
  window?: { fromHourUtc: number; toHourUtc: number }
  /** Segundos de lease: cuánto puede tardar un job sin heartbeat antes de reencolarse. */
  leaseSeconds: number
}

/** A partir de esta prioridad el job salta las ventanas horarias. */
export const MANUAL_PRIORITY = 8

export const LANES: Record<Lane, LaneConfig> = {
  default: { concurrency: 2, leaseSeconds: 900 },
  meta: { concurrency: 2, leaseSeconds: 900 },
  tc: { concurrency: 2, leaseSeconds: 600 },
  gsc: { concurrency: 1, leaseSeconds: 600 },
  // Una búsqueda por vez: SerpAPI cobra por llamada y el tope diario vive en
  // provider_budgets; no tiene sentido paralelizar.
  serpapi: { concurrency: 1, leaseSeconds: 600 },
  // El cotizador-bot corre con un solo worker y lo comparte con el bot del CRM
  // en horario comercial (p50 30 s por cotización). Los lotes van de noche:
  // 22:00–07:00 ART = 01:00–10:00 UTC.
  cotizador: { concurrency: 1, window: { fromHourUtc: 1, toHourUtc: 10 }, leaseSeconds: 1800 },
  // El CRM pide horario de baja carga: 02:00–06:00 ART = 05:00–09:00 UTC.
  crm: { concurrency: 1, window: { fromHourUtc: 5, toHourUtc: 9 }, leaseSeconds: 1800 },
}

export const ALL_LANES = Object.keys(LANES) as Lane[]

/** Un job normal sólo corre dentro de la ventana del lane; uno manual, siempre. */
export function isLaneOpen(lane: Lane, priority: number, now: Date = new Date()): boolean {
  if (priority >= MANUAL_PRIORITY) return true
  const window = LANES[lane].window
  if (!window) return true
  const hour = now.getUTCHours()
  if (window.fromHourUtc <= window.toHourUtc) {
    return hour >= window.fromHourUtc && hour < window.toHourUtc
  }
  // Ventana que cruza la medianoche (ej. 22 → 6).
  return hour >= window.fromHourUtc || hour < window.toHourUtc
}
