import type { createAdminClient } from '@/lib/supabase/admin'

export type Db = ReturnType<typeof createAdminClient>

/**
 * Un lane agrupa jobs que comparten un recurso externo con límite propio:
 * el cotizador tiene un solo worker, SerpAPI cobra por búsqueda, el CRM pide
 * horario de baja carga. La concurrencia y las ventanas viven en lanes.ts.
 */
export type Lane = 'default' | 'meta' | 'serpapi' | 'cotizador' | 'crm' | 'tc' | 'gsc' | 'vuelos' | 'sabre'

export type JobStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'skipped'

export interface JobRow {
  id: number
  kind: string
  lane: Lane
  payload: Record<string, unknown>
  status: JobStatus
  priority: number
  run_after: string
  attempts: number
  max_attempts: number
  dedupe_key: string | null
  locked_by: string | null
  locked_until: string | null
  heartbeat_at: string | null
  last_error: string | null
  result: Record<string, unknown> | null
  entity_type: string | null
  entity_id: string | null
  created_by: string | null
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export interface EnqueueInput {
  kind: string
  payload?: Record<string, unknown>
  /** Si no se pasa, se toma del registro del handler. */
  lane?: Lane
  /** 5 normal; 8 o más = manual, salta las ventanas horarias del lane. */
  priority?: number
  runAfter?: Date
  /** Mientras exista un job pendiente o corriendo con esta clave, no se encola otro. */
  dedupeKey?: string
  entityType?: string
  entityId?: string | number
  createdBy?: string
  maxAttempts?: number
}

export type JobOutcome =
  | { ok: true; result?: Record<string, unknown> }
  /** El job no debía correr (flag apagado, presupuesto, ventana). No es un error. */
  | { ok: false; skipped: true; reason: string }
  /** Falló; se reintenta si quedan intentos. */
  | { ok: false; skipped?: false; error: string; retry?: boolean; result?: Record<string, unknown> }

export interface JobContext {
  db: Db
  job: JobRow
  /** Renueva el lease. Llamarlo en loops largos para que no se reencole. */
  heartbeat: () => Promise<void>
  /** Escribe en system_logs con source 'automation' y el job como detalle. */
  log: (message: string, details?: Record<string, unknown>, level?: 'info' | 'warning' | 'error') => Promise<void>
}

export type JobHandler = (ctx: JobContext) => Promise<JobOutcome>

export interface HandlerDefinition {
  kind: string
  lane: Lane
  handler: JobHandler
  /**
   * Kill switches que deben estar prendidos además de automation.global.
   * Apagado cualquiera de ellos, el job termina `skipped`, nunca `failed`.
   */
  flags?: string[]
  /** Proveedor cuyo presupuesto se chequea antes de correr. */
  provider?: string
  description: string
}
