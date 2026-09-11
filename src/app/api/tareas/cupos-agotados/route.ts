import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import {
  loadFlightsForMatch,
  findPackagesForFlights,
  calculateCupos,
  getFlightRoute,
  type FlightForMatch,
  type MatchConfidence,
  type MatchCriteria,
} from '@/lib/packages/flight-match'

export interface CupoAlternative {
  id: number
  status: 'proposed' | 'approved' | 'applying' | 'applied' | 'rejected' | 'failed' | 'superseded'
  seasonKind: string | null
  windowFrom: string | null
  windowTo: string | null
  currentDeparture: string | null
  currentPricePp: number | null
  proposedDeparture: string | null
  proposedReturn: string | null
  pricePp: number | null
  variancePct: number | null
  airline: string | null
  flightNumbers: string[]
  direct: boolean | null
  hotelNames: string[]
  hotelMatched: boolean | null
  note: string | null
  reason: string | null
  createdAt: string
}

export interface CupoAgotadoPackage {
  packageId: number
  tcPackageId: number
  title: string
  status: string | null
  sendToMarketing: boolean | null
  confidence: MatchConfidence
  criteria: MatchCriteria
  /** Última propuesta de fecha alternativa en la misma temporada, si la hay. */
  alternative: CupoAlternative | null
  /** Hay un job buscando fecha ahora mismo. */
  searching: boolean
}

export interface CupoAgotadoTask {
  /** Id del tramo de ida (o del único tramo si no está apareado). */
  flightId: number
  pairedFlightId: number | null
  baseId: string | null
  name: string | null
  route: string
  departureDate: string
  returnDate: string | null
  supplierId: number | null
  supplierName: string | null
  cupos: { total: number; sold: number; remaining: number }
  packages: CupoAgotadoPackage[]
}

/** Hoy en Argentina (UTC-3), igual que el resto del módulo de cupos. */
function todayInArgentina(): string {
  const now = new Date()
  return new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * GET /api/tareas/cupos-agotados
 *
 * Cupos sin lugares cuya salida todavía no ocurrió, junto con los paquetes que
 * los siguen vendiendo. Se excluyen los pares ya revisados, salvo que el cupo
 * se haya movido desde entonces.
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const flights = await loadFlightsForMatch(db)
    const hoy = todayInArgentina()

    const agotados = flights.filter(f => {
      const cupos = calculateCupos(f.modalities)
      // total > 0 descarta los vuelos sin inventario cargado, que no están
      // agotados sino sin configurar.
      return cupos.total > 0 && cupos.remaining === 0 && f.start_date >= hoy
    })

    if (agotados.length === 0) {
      return NextResponse.json({ tasks: [], totalFlights: 0 })
    }

    // El índice se arma con TODOS los vuelos: ver el comentario en
    // findPackagesForFlights sobre por qué esto importa.
    const packagesByFlight = await findPackagesForFlights(db, agotados, flights)

    const { data: reviews } = await db
      .from('flight_package_reviews')
      .select('flight_id, package_id, decision, sold_at_review, quantity_at_review')
      .in('flight_id', agotados.map(f => f.id))

    const reviewByPair = new Map<string, { sold: number | null; quantity: number | null }>()
    for (const r of reviews || []) {
      reviewByPair.set(`${r.flight_id}-${r.package_id}`, {
        sold: r.sold_at_review,
        quantity: r.quantity_at_review,
      })
    }

    const { data: suppliers } = await db.from('suppliers').select('id, name')
    const supplierNames = new Map<number, string>()
    for (const s of suppliers || []) supplierNames.set(s.id, s.name)

    const byId = new Map<number, FlightForMatch>(flights.map(f => [f.id, f]))
    const yaCubiertos = new Set<number>()
    const tasks: CupoAgotadoTask[] = []

    // Se ordena por fecha de salida para que la ida caiga antes que su vuelta.
    for (const flight of [...agotados].sort((a, b) => a.start_date.localeCompare(b.start_date))) {
      if (yaCubiertos.has(flight.id)) continue

      // Ida y vuelta son el mismo cupo comercial: se muestran como una tarea.
      // Se listan los paquetes de las dos piernas porque si cualquiera está
      // llena el paquete ya no se puede vender.
      const paired = flight.paired_flight_id ? byId.get(flight.paired_flight_id) : undefined
      const legs = paired ? [flight, paired] : [flight]
      for (const leg of legs) yaCubiertos.add(leg.id)

      // El encabezado siempre muestra la ida, aunque la que se haya agotado sea
      // la vuelta.
      const outbound = legs.find(l => l.leg_type === 'outbound')
        ?? [...legs].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
      const returnLeg = legs.find(l => l.id !== outbound.id) ?? null

      const cupos = calculateCupos(flight.modalities)

      // Un paquete puede matchear la ida, la vuelta o las dos: se junta todo y
      // se descartan los que ya no están publicados en TC.
      const seen = new Set<number>()
      const packages: CupoAgotadoPackage[] = []
      for (const leg of legs) {
        for (const pkg of packagesByFlight.get(leg.id) || []) {
          if (seen.has(pkg.packageId)) continue
          if (pkg.tcActive === false) continue

          const review = reviewByPair.get(`${leg.id}-${pkg.packageId}`)
          if (review) {
            const legCupos = calculateCupos(leg.modalities)
            const sinCambios = review.sold === legCupos.sold && review.quantity === legCupos.total
            // Si el cupo no se movió desde que se revisó, la tarea sigue resuelta.
            if (sinCambios) continue
          }

          seen.add(pkg.packageId)
          packages.push({
            packageId: pkg.packageId,
            tcPackageId: pkg.tcPackageId,
            title: pkg.title,
            status: pkg.status,
            sendToMarketing: pkg.sendToMarketing,
            confidence: pkg.confidence,
            criteria: pkg.criteria,
            alternative: null,
            searching: false,
          })
        }
      }

      if (packages.length === 0) continue

      const route = getFlightRoute(outbound)

      tasks.push({
        flightId: outbound.id,
        pairedFlightId: returnLeg?.id ?? null,
        baseId: (outbound.base_id || '').replace(/-(IDA|VUELTA)$/, '') || outbound.base_id,
        name: outbound.name,
        route: `${route.origin ?? '?'} → ${route.destination ?? '?'}`,
        departureDate: outbound.start_date,
        returnDate: returnLeg?.start_date ?? null,
        supplierId: outbound.supplier_id,
        supplierName: outbound.supplier_id ? supplierNames.get(outbound.supplier_id) ?? null : null,
        cupos,
        packages,
      })
    }

    // Propuestas de fecha alternativa y búsquedas en curso, por paquete.
    const pkgIds = [...new Set(tasks.flatMap(t => t.packages.map(p => p.packageId)))]
    if (pkgIds.length > 0) {
      const [{ data: alts }, { data: jobs }] = await Promise.all([
        db.from('requote_alternatives').select('id, package_id, status, season_kind, window_from, window_to, current_departure, current_price_pp, proposed_departure, proposed_return, price_pp, variance_pct, airline, flight_numbers, direct, hotel_names, hotel_matched, stopover_note, reason, created_at').in('package_id', pkgIds).in('status', ['proposed', 'approved', 'applying', 'applied', 'failed']).order('created_at', { ascending: false }),
        db.from('hub_jobs').select('payload').eq('kind', 'package.alternative_date').in('status', ['queued', 'running']),
      ])
      const latest = new Map<number, CupoAlternative>()
      for (const a of (alts ?? []) as Array<Record<string, unknown>>) {
        const pid = Number(a.package_id)
        if (latest.has(pid)) continue
        latest.set(pid, { id: Number(a.id), status: a.status as CupoAlternative['status'], seasonKind: (a.season_kind as string | null) ?? null, windowFrom: (a.window_from as string | null) ?? null, windowTo: (a.window_to as string | null) ?? null, currentDeparture: (a.current_departure as string | null) ?? null, currentPricePp: a.current_price_pp === null ? null : Number(a.current_price_pp), proposedDeparture: (a.proposed_departure as string | null) ?? null, proposedReturn: (a.proposed_return as string | null) ?? null, pricePp: a.price_pp === null ? null : Number(a.price_pp), variancePct: a.variance_pct === null ? null : Number(a.variance_pct), airline: (a.airline as string | null) ?? null, flightNumbers: (a.flight_numbers as string[] | null) ?? [], direct: (a.direct as boolean | null) ?? null, hotelNames: (a.hotel_names as string[] | null) ?? [], hotelMatched: (a.hotel_matched as boolean | null) ?? null, note: (a.stopover_note as string | null) ?? null, reason: (a.reason as string | null) ?? null, createdAt: String(a.created_at) })
      }
      const searching = new Set((jobs ?? []).map(j => Number((j as { payload: { packageId?: number } }).payload?.packageId)))
      for (const t of tasks) for (const p of t.packages) { p.alternative = latest.get(p.packageId) ?? null; p.searching = searching.has(p.packageId) }
    }

    return NextResponse.json({
      tasks,
      totalFlights: agotados.length,
    })
  } catch (error) {
    return errorResponse(error)
  }
}
