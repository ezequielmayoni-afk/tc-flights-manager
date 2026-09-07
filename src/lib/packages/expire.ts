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
  context?: { reason?: string; flightId?: number; flightLabel?: string }
): Promise<ExpirePackageResult> {
  const tcResult = await deactivatePackage(pkg.tc_package_id)
  const tcError = tcResult.success ? undefined : (tcResult.error || 'Error al desactivar en TC')

  const { error: dbError } = await db
    .from('packages')
    .update({ status: 'expired', tc_active: false })
    .eq('id', pkg.id)

  await logEvent(db, {
    source: 'paquetes',
    action: 'package.expired',
    level: tcError || dbError ? 'error' : 'info',
    message: tcError
      ? `Paquete dado de baja en hub, pero TC falló: ${tcError}`
      : `Paquete dado de baja y desactivado en TC${context?.reason ? ` (${context.reason})` : ''}`,
    entityType: 'package',
    entityId: pkg.id,
    entityLabel: `${pkg.tc_package_id} · ${pkg.title}`,
    details: {
      tc_package_id: pkg.tc_package_id,
      tc_deactivated: tcResult.success,
      tc_error: tcError ?? null,
      db_error: dbError?.message ?? null,
      reason: context?.reason ?? null,
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
