import { NextResponse } from 'next/server'

/**
 * Custom API Error class with status code and error code
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// Common API errors
export const API_ERRORS = {
  NOT_FOUND: (resource: string) => new ApiError(`${resource} no encontrado`, 404, 'NOT_FOUND'),
  UNAUTHORIZED: () => new ApiError('No autorizado', 401, 'UNAUTHORIZED'),
  FORBIDDEN: () => new ApiError('Acceso denegado', 403, 'FORBIDDEN'),
  BAD_REQUEST: (message: string) => new ApiError(message, 400, 'BAD_REQUEST'),
  CONFLICT: (message: string) => new ApiError(message, 409, 'CONFLICT'),
  INTERNAL: () => new ApiError('Error interno del servidor', 500, 'INTERNAL_ERROR'),
  VALIDATION: (field: string) => new ApiError(`Campo inv\u00e1lido: ${field}`, 400, 'VALIDATION_ERROR'),
  RATE_LIMIT: () => new ApiError('Demasiadas solicitudes, intente m\u00e1s tarde', 429, 'RATE_LIMIT'),
}

/**
 * Handle any error and return a safe, sanitized response
 * Logs the full error internally but only exposes safe messages to clients
 */
export function handleApiError(error: unknown): {
  message: string
  status: number
  code?: string
} {
  // Known API errors - return as-is
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.statusCode,
      code: error.code
    }
  }

  // Supabase/PostgreSQL errors
  if (error && typeof error === 'object' && 'code' in error) {
    const dbError = error as { code: string; message: string; details?: string }

    // Map common database errors to user-friendly messages
    switch (dbError.code) {
      case '23505': // unique_violation
        return { message: 'El registro ya existe', status: 409, code: 'DUPLICATE' }
      case '23503': // foreign_key_violation
        return { message: 'Referencia inv\u00e1lida', status: 400, code: 'INVALID_REF' }
      case '23502': // not_null_violation
        return { message: 'Faltan campos requeridos', status: 400, code: 'MISSING_FIELDS' }
      case '22P02': // invalid_text_representation
        return { message: 'Formato de datos inv\u00e1lido', status: 400, code: 'INVALID_FORMAT' }
      case '42501': // insufficient_privilege
        return { message: 'No tiene permisos para esta operaci\u00f3n', status: 403, code: 'FORBIDDEN' }
      case 'PGRST116': // Supabase - no rows returned
        return { message: 'Recurso no encontrado', status: 404, code: 'NOT_FOUND' }
      case 'PGRST301': // Supabase - JWT expired
        return { message: 'Sesi\u00f3n expirada', status: 401, code: 'SESSION_EXPIRED' }
    }
  }

  // Fetch/Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    console.error('[API Error] Network error:', error)
    return { message: 'Error de conexi\u00f3n', status: 503, code: 'NETWORK_ERROR' }
  }

  // Timeout errors
  if (error instanceof Error && error.name === 'AbortError') {
    return { message: 'La operaci\u00f3n tard\u00f3 demasiado', status: 504, code: 'TIMEOUT' }
  }

  // Generic Error objects - log details internally
  if (error instanceof Error) {
    console.error('[API Error] Unhandled error:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    })
  } else {
    console.error('[API Error] Unknown error type:', error)
  }

  // Return generic message - never expose internal details
  return {
    message: 'Error interno del servidor',
    status: 500,
    code: 'INTERNAL_ERROR'
  }
}

/**
 * Create a NextResponse with proper error formatting
 */
export function errorResponse(error: unknown): NextResponse {
  const { message, status, code } = handleApiError(error)

  return NextResponse.json(
    {
      error: message,
      code,
      timestamp: new Date().toISOString()
    },
    { status }
  )
}

/**
 * Wrap an async handler with automatic error handling
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>
): Promise<T | NextResponse> {
  return handler().catch((error) => {
    return errorResponse(error)
  })
}

/**
 * Validate required fields in a request body
 * Throws ApiError if any required field is missing
 */
export function validateRequired(
  body: Record<string, unknown>,
  requiredFields: string[]
): void {
  const missing = requiredFields.filter(field => {
    const value = body[field]
    return value === undefined || value === null || value === ''
  })

  if (missing.length > 0) {
    throw new ApiError(
      `Campos requeridos: ${missing.join(', ')}`,
      400,
      'VALIDATION_ERROR'
    )
  }
}
