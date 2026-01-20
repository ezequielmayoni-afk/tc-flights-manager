import { createClient } from '@supabase/supabase-js'

// =====================================================
// Structured Logger for Application-wide Logging
// =====================================================

type LogLevel = 'debug' | 'info' | 'warn' | 'error'

interface LogEntry {
  level: LogLevel
  message: string
  context?: string
  data?: Record<string, unknown>
  timestamp: string
}

class Logger {
  private context: string

  constructor(context: string) {
    this.context = context
  }

  private log(level: LogLevel, message: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      level,
      message,
      context: this.context,
      data,
      timestamp: new Date().toISOString()
    }

    // In development: human-readable format
    if (process.env.NODE_ENV === 'development') {
      const prefix = `[${entry.context}]`
      const dataStr = data ? ` ${JSON.stringify(data)}` : ''

      switch (level) {
        case 'debug': console.debug(prefix, message, dataStr); break
        case 'info': console.info(prefix, message, dataStr); break
        case 'warn': console.warn(prefix, message, dataStr); break
        case 'error': console.error(prefix, message, dataStr); break
      }
    } else {
      // In production: structured JSON for log aggregation
      console.log(JSON.stringify(entry))
    }
  }

  debug(message: string, data?: Record<string, unknown>) {
    this.log('debug', message, data)
  }

  info(message: string, data?: Record<string, unknown>) {
    this.log('info', message, data)
  }

  warn(message: string, data?: Record<string, unknown>) {
    this.log('warn', message, data)
  }

  error(message: string, data?: Record<string, unknown>) {
    this.log('error', message, data)
  }
}

/**
 * Create a logger instance with a specific context
 * Usage: const log = createLogger('MetaAds')
 *        log.info('Creating ad', { packageId: 123 })
 */
export function createLogger(context: string): Logger {
  return new Logger(context)
}

// =====================================================
// Sync Operation Logging (Database)
// =====================================================

export type SyncAction = 'create' | 'update' | 'delete'
export type SyncDirection = 'push' | 'pull'
export type SyncStatus = 'success' | 'error'

export interface SyncLogEntry {
  entity_type: string
  entity_id: number
  action: SyncAction
  direction: SyncDirection
  status: SyncStatus
  request_payload?: Record<string, unknown> | null
  response_payload?: Record<string, unknown> | null
  error_message?: string | null
  created_by?: string | null
}

// Server-side logger using service role key
function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.warn('Supabase credentials not found for logging')
    return null
  }

  return createClient(url, key)
}

// Log sync operation to database (server-side)
export async function logSyncOperation(entry: SyncLogEntry): Promise<void> {
  try {
    const supabase = getSupabaseAdmin()
    if (!supabase) {
      console.log(`[SYNC ${entry.status}] ${entry.entity_type}#${entry.entity_id}: ${entry.action} ${entry.direction}`)
      return
    }

    const { error } = await supabase
      .from('sync_logs')
      .insert({
        entity_type: entry.entity_type,
        entity_id: entry.entity_id,
        action: entry.action,
        direction: entry.direction,
        status: entry.status,
        request_payload: entry.request_payload || null,
        response_payload: entry.response_payload || null,
        error_message: entry.error_message || null,
        created_by: entry.created_by || null,
      })

    if (error) {
      console.error('Failed to save sync log to database:', error)
    }
  } catch (err) {
    console.error('Logger error:', err)
  }
}

// Convenience logger object
export const logger = {
  // Log a successful sync operation
  syncSuccess: (
    entityType: string,
    entityId: number,
    action: SyncAction,
    direction: SyncDirection,
    requestPayload?: Record<string, unknown>,
    responsePayload?: Record<string, unknown>
  ) =>
    logSyncOperation({
      entity_type: entityType,
      entity_id: entityId,
      action,
      direction,
      status: 'success',
      request_payload: requestPayload,
      response_payload: responsePayload,
    }),

  // Log a failed sync operation
  syncError: (
    entityType: string,
    entityId: number,
    action: SyncAction,
    direction: SyncDirection,
    errorMessage: string,
    requestPayload?: Record<string, unknown>,
    responsePayload?: Record<string, unknown>
  ) =>
    logSyncOperation({
      entity_type: entityType,
      entity_id: entityId,
      action,
      direction,
      status: 'error',
      error_message: errorMessage,
      request_payload: requestPayload,
      response_payload: responsePayload,
    }),

  // TravelCompositor specific loggers
  tc: {
    pushSuccess: (entityType: string, entityId: number, action: SyncAction, request?: Record<string, unknown>, response?: Record<string, unknown>) =>
      logSyncOperation({
        entity_type: entityType,
        entity_id: entityId,
        action,
        direction: 'push',
        status: 'success',
        request_payload: request,
        response_payload: response,
      }),

    pushError: (entityType: string, entityId: number, action: SyncAction, error: string, request?: Record<string, unknown>, response?: Record<string, unknown>) =>
      logSyncOperation({
        entity_type: entityType,
        entity_id: entityId,
        action,
        direction: 'push',
        status: 'error',
        error_message: error,
        request_payload: request,
        response_payload: response,
      }),

    pullSuccess: (entityType: string, entityId: number, action: SyncAction, request?: Record<string, unknown>, response?: Record<string, unknown>) =>
      logSyncOperation({
        entity_type: entityType,
        entity_id: entityId,
        action,
        direction: 'pull',
        status: 'success',
        request_payload: request,
        response_payload: response,
      }),

    pullError: (entityType: string, entityId: number, action: SyncAction, error: string, request?: Record<string, unknown>, response?: Record<string, unknown>) =>
      logSyncOperation({
        entity_type: entityType,
        entity_id: entityId,
        action,
        direction: 'pull',
        status: 'error',
        error_message: error,
        request_payload: request,
        response_payload: response,
      }),
  },
}
