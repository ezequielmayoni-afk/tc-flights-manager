import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess, isReadOnlyRole } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { expirePackageInTC } from '@/lib/packages/expire'
import { switchPackageToSystem, type SwitchToSystemResult } from '@/lib/packages/switch-to-system'
import { sendCupoSoldOutNotice } from '@/lib/notifications/cupo-sold-out'
import { logEvent } from '@/lib/logs'
import {
  loadFlightsForMatch,
  calculateCupos,
  getFlightRoute,
} from '@/lib/packages/flight-match'

/**
 * POST /api/tareas/cupos-agotados/resolve
 *
 * Resuelve un par cupo/paquete de la lista de cupos agotados:
 *  - `deactivate`: da de baja el paquete en TC y avisa a marketing.
 *  - `keep`: lo deja publicado (se le va a cambiar el aéreo) y solo lo marca
 *    revisado para que salga de la lista.
 *  - `switch_to_system`: el cupo ya se reemplazó en TC por una tarifa de
 *    sistema; HUB relee TC, saca el paquete de cupo y prende el monitoreo.
 *
 * En los dos casos se guarda cómo estaba el cupo, así que si después se
 * amplía o se liberan lugares y se vuelve a agotar, la tarea reaparece.
 */
export async function POST(request: NextRequest) {
  const { authorized, user } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  if (user && isReadOnlyRole(user.role)) {
    return NextResponse.json({ error: 'Tu rol es de solo lectura' }, { status: 403 })
  }

  const db = createAdminClient()

  try {
    const { flightId, packageId, decision, note } = await request.json()

    if (!flightId || !packageId || !['deactivate', 'keep', 'switch_to_system'].includes(decision)) {
      return NextResponse.json(
        { error: 'Faltan datos: flightId, packageId y decision (deactivate | keep | switch_to_system)' },
        { status: 400 }
      )
    }

    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id, title')
      .eq('id', packageId)
      .single()

    if (pkgError || !pkg) {
      return NextResponse.json({ error: 'Paquete no encontrado' }, { status: 404 })
    }

    // Se traen las dos piernas para poder guardar la foto del cupo y armar la
    // etiqueta del aviso.
    const flights = await loadFlightsForMatch(db, { activeOnly: false })
    const flight = flights.find(f => f.id === flightId)

    if (!flight) {
      return NextResponse.json({ error: 'Cupo no encontrado' }, { status: 404 })
    }

    const legs = [flight, ...(flight.paired_flight_id
      ? flights.filter(f => f.id === flight.paired_flight_id)
      : [])]
    const cupos = calculateCupos(flight.modalities)
    const route = getFlightRoute(flight)
    const flightLabel = `${(flight.base_id || '').replace(/-(IDA|VUELTA)$/, '')} · ${route.origin ?? '?'}→${route.destination ?? '?'}`
    const actor = user ? { id: user.id, email: user.email } : null

    let tcError: string | undefined
    let noticeSkipped: string | undefined

    let switched: SwitchToSystemResult | null = null
    if (decision === 'switch_to_system') {
      switched = await switchPackageToSystem(db, pkg.id, actor)
      if (!switched.ok) return NextResponse.json({ error: switched.reason }, { status: switched.status })
    } else if (decision === 'deactivate') {
      const expired = await expirePackageInTC(db, pkg, actor, {
        reason: `cupo agotado (${flightLabel})`,
        flightId: flight.id,
        flightLabel,
      })
      tcError = expired.tcError

      if (expired.dbError) {
        return NextResponse.json(
          { error: `No se pudo dar de baja el paquete: ${expired.dbError}` },
          { status: 500 }
        )
      }

      const notice = await sendCupoSoldOutNotice(db, {
        packageId: pkg.id,
        tcPackageId: pkg.tc_package_id,
        packageTitle: pkg.title,
        flightId: flight.id,
        flightLabel,
        departureDate: flight.start_date,
        cuposTotal: cupos.total,
        requestedByEmail: user?.email ?? null,
      })
      noticeSkipped = notice.skipped || notice.error
    } else {
      await logEvent(db, {
        source: 'cupos',
        action: 'cupo.package_kept_visible',
        message: `Se mantiene publicado ${pkg.tc_package_id} con el cupo ${flightLabel} agotado (se le cambia el aéreo)`,
        entityType: 'package',
        entityId: pkg.id,
        entityLabel: `${pkg.tc_package_id} · ${pkg.title}`,
        flightId: flight.id,
        details: {
          flight: flightLabel,
          departure_date: flight.start_date,
          cupos,
          note: note ?? null,
        },
      }, actor)
    }

    // Se marca revisado en las dos piernas: la tarea agrupa ida y vuelta, así
    // que si solo se marcara una, reaparecería por la otra.
    const rows = legs.map(leg => {
      const legCupos = calculateCupos(leg.modalities)
      return {
        flight_id: leg.id,
        package_id: pkg.id,
        decision: decision === 'deactivate' ? 'deactivated' : decision === 'switch_to_system' ? 'switched_to_system' : 'kept_visible',
        note: note ?? null,
        sold_at_review: legCupos.sold,
        quantity_at_review: legCupos.total,
        reviewed_by: user?.id ?? null,
        reviewed_by_email: user?.email ?? null,
        reviewed_at: new Date().toISOString(),
      }
    })

    const { error: reviewError } = await db
      .from('flight_package_reviews')
      .upsert(rows, { onConflict: 'flight_id,package_id' })

    if (reviewError) {
      console.error('[cupos-agotados] No se pudo registrar la revisión:', reviewError)
    }

    return NextResponse.json({
      success: true,
      decision,
      tcError,
      noticeSkipped,
      switched: switched && switched.ok ? switched : undefined,
      message: decision === 'switch_to_system' && switched?.ok
        ? `Pasó a aéreo de sistema${switched.variancePct !== null ? ` (precio ${switched.variancePct > 0 ? '+' : ''}${switched.variancePct}%: USD ${switched.oldPrice} → USD ${switched.newPrice})` : ''}; monitoreo encendido y primera recotización en cola`
        : decision === 'deactivate'
        ? tcError
          ? `Paquete dado de baja en hub, pero TC falló: ${tcError}`
          : 'Paquete dado de baja y aviso enviado a marketing'
        : 'Marcado como revisado, el paquete sigue publicado',
    })
  } catch (error) {
    return errorResponse(error)
  }
}
