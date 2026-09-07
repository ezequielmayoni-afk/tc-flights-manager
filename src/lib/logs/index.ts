import { createAdminClient } from '@/lib/supabase/admin'
import { getUserWithRole } from '@/lib/auth'

type Db = ReturnType<typeof createAdminClient>

export type LogLevel = 'error' | 'warning' | 'info' | 'debug'

/**
 * Áreas del sistema. Es lo que se filtra en la pantalla de Logs.
 */
export type LogSource =
  | 'paquetes'
  | 'cupos'
  | 'marketing'
  | 'diseño'
  | 'seo'
  | 'cron'
  | 'tc-sync'
  | 'meta'
  | 'notificaciones'

export interface LogEventInput {
  source: LogSource
  /** Identificador estable del evento, ej: 'package.sent_to_design' */
  action: string
  /** Texto legible: es lo que se lee en la pantalla */
  message: string
  level?: LogLevel
  entityType?: 'package' | 'flight' | 'creative' | 'reservation'
  entityId?: number
  /** Título del paquete, base_id del vuelo… para no tener que resolverlo al leer */
  entityLabel?: string
  details?: Record<string, unknown>
  durationMs?: number
  /** Vuelo relacionado (columna dedicada que ya existía en la tabla) */
  flightId?: number
  tcTransportId?: string
}

/**
 * Registra un evento del sistema.
 *
 * Nunca lanza: un fallo al loguear no puede tumbar la operación que se está
 * registrando. Si no se pasa actor, intenta resolver el usuario de la sesión;
 * cuando no hay sesión (cron, webhook) el evento queda como automático.
 */
export async function logEvent(
  db: Db,
  input: LogEventInput,
  actor?: { id: string | null; email: string | null } | null
): Promise<void> {
  try {
    let actorId = actor?.id ?? null
    let actorEmail = actor?.email ?? null

    if (actor === undefined) {
      const user = await getUserWithRole().catch(() => null)
      actorId = user?.id ?? null
      actorEmail = user?.email ?? null
    }

    await db.from('system_logs').insert({
      level: input.level || 'info',
      source: input.source,
      action: input.action,
      message: input.message,
      details: input.details ?? null,
      entity_type: input.entityType ?? null,
      entity_id: input.entityId ?? null,
      entity_label: input.entityLabel ?? null,
      user_id: actorId,
      actor_email: actorEmail,
      duration_ms: input.durationMs ?? null,
      flight_id: input.flightId ?? null,
      tc_transport_id: input.tcTransportId ?? null,
    })
  } catch (error) {
    console.error('[logEvent] No se pudo registrar el evento:', input.action, error)
  }
}

/**
 * Versión para varios eventos de una tanda (acciones masivas), en un solo insert.
 */
export async function logEvents(
  db: Db,
  inputs: LogEventInput[],
  actor?: { id: string | null; email: string | null } | null
): Promise<void> {
  if (inputs.length === 0) return

  try {
    let actorId = actor?.id ?? null
    let actorEmail = actor?.email ?? null

    if (actor === undefined) {
      const user = await getUserWithRole().catch(() => null)
      actorId = user?.id ?? null
      actorEmail = user?.email ?? null
    }

    await db.from('system_logs').insert(
      inputs.map(input => ({
        level: input.level || 'info',
        source: input.source,
        action: input.action,
        message: input.message,
        details: input.details ?? null,
        entity_type: input.entityType ?? null,
        entity_id: input.entityId ?? null,
        entity_label: input.entityLabel ?? null,
        user_id: actorId,
        actor_email: actorEmail,
        duration_ms: input.durationMs ?? null,
        flight_id: input.flightId ?? null,
        tc_transport_id: input.tcTransportId ?? null,
      }))
    )
  } catch (error) {
    console.error('[logEvents] No se pudieron registrar los eventos:', error)
  }
}
