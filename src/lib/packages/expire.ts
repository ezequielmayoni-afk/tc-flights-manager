import { deactivatePackage } from '@/lib/travelcompositor/client'
import { logEvent } from '@/lib/logs'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export interface ExpirePackageResult {
  /** true si la fila local quedó marcada como vencida, aunque TC haya fallado. */
  ok: boolean
  /** Error de TC, si lo hubo. La baja local se hace igual. */
  tcError?: string
  dbError?: string
}

/**
 * Da de baja un paquete: lo desactiva en TC y lo marca vencido en hub.
 *
 * Está acá y no dentro del bulk-action para que la baja sea exactamente la
 * misma venga de donde venga (la acción masiva de la tabla de paquetes o la
 * pantalla de cupos agotados).
 *
 * Si TC falla igual se marca local y se devuelve el error: es el comportamiento
 * que ya tenía el bulk-action, y dejar las dos puntas desincronizadas a la
 * vista es mejor que perder la acción del usuario.
 */
export async function expirePackageInTC(
  db: Db,
  pkg: { id: number; tc_package_id: number; title: string },
  actor?: { id: string | null; email: string | null } | null,
  context?: {
    reason?: string
    flightId?: number
    flightLabel?: string
    /** 'expired' es la baja por vencimiento; 'not_visible' es sacarlo de la venta. */
    status?: 'expired' | 'not_visible'
    /** Apaga el monitoreo: si el paquete no se ve, no hay precio que vigilar. */
    stopMonitoring?: boolean
  }
): Promise<ExpirePackageResult> {
  const status = context?.status ?? 'expired'
  const tcResult = await deactivatePackage(pkg.tc_package_id)
  const tcError = tcResult.success ? undefined : (tcResult.error || 'Error al desactivar en TC')

  const { error: dbError } = await db
    .from('packages')
    .update({
      status,
      tc_active: false,
      ...(context?.stopMonitoring
        ? {
            monitor_enabled: false,
            requote_status: null,
            requote_price: null,
            requote_variance_pct: null,
            target_price: null,
          }
        : {}),
    })
    .eq('id', pkg.id)

  await logEvent(db, {
    source: 'paquetes',
    action: status === 'not_visible' ? 'package.not_visible' : 'package.expired',
    level: tcError || dbError ? 'error' : 'info',
    message: tcError
      ? `${status === 'not_visible' ? 'Marcado como no visible' : 'Paquete dado de baja'} en hub, pero TC falló: ${tcError}`
      : `${status === 'not_visible' ? 'Marcado como no visible y desactivado' : 'Paquete dado de baja y desactivado'} en TC${context?.reason ? ` (${context.reason})` : ''}`,
    entityType: 'package',
    entityId: pkg.id,
    entityLabel: `${pkg.tc_package_id} · ${pkg.title}`,
    details: {
      tc_package_id: pkg.tc_package_id,
      tc_deactivated: tcResult.success,
      tc_error: tcError ?? null,
      db_error: dbError?.message ?? null,
      reason: context?.reason ?? null,
      status,
      monitoreo_apagado: context?.stopMonitoring ?? false,
      flight_id: context?.flightId ?? null,
      flight: context?.flightLabel ?? null,
    },
  }, actor)

  return {
    ok: !dbError,
    tcError,
    dbError: dbError?.message,
  }
}
