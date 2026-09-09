import { calculateCupos, findFlightsForPackages, loadFlightsForMatch, type FlightCupos } from '@/lib/packages/flight-match'
import type { Db } from '@/lib/jobs/types'

/**
 * Vínculo cupo ↔ paquete persistido (`flight_package_links`).
 *
 * El matcheo (flight-match.ts) se deducía en cada request y no quedaba en
 * ningún lado. Ahora se refresca a diario y un humano lo confirma: sólo un
 * vínculo confirmado o de confianza alta autoriza a pausar anuncios u
 * ocultar en TC sin una persona en el medio.
 */

export interface PackageLink {
  id: number
  flightId: number
  packageId: number
  confidence: 'alta' | 'media' | 'baja'
  source: 'auto_match' | 'cupo_request' | 'manual'
  confirmed: boolean
  rejected: boolean
  lastSeenAt: string
  matchCriteria: Record<string, unknown>
  flight: { baseId: string | null; name: string | null; startDate: string; endDate: string; active: boolean | null; legType: string | null; pairedFlightId: number | null } | null
  cupos: FlightCupos | null
  /** Un humano ya decidió "mantener visible" con este mismo estado del cupo. */
  keptVisible: boolean
}

/** Días sin verse en el matcheo automático tras los cuales un vínculo deja de contar. */
export const LINK_STALE_DAYS = 7

/** Recalcula el matcheo para los paquetes dados (o todos los activos) y lo persiste. */
export async function refreshFlightPackageLinks(db: Db, packageIds?: number[]): Promise<{ scanned: number; upserted: number; packagesWithLinks: number }> {
  let ids = packageIds
  if (!ids) {
    const { data } = await db.from('packages').select('id').eq('tc_active', true).not('status', 'in', '("expired","not_visible")')
    ids = ((data ?? []) as Array<{ id: number }>).map(p => p.id)
  }
  if (ids.length === 0) return { scanned: 0, upserted: 0, packagesWithLinks: 0 }

  const matches = await findFlightsForPackages(db, ids)
  const now = new Date().toISOString()
  let upserted = 0
  for (const [packageId, list] of matches) {
    for (const m of list) {
      const { error } = await db.from('flight_package_links').upsert({
        flight_id: m.flightId,
        package_id: packageId,
        confidence: m.confidence,
        source: 'auto_match',
        match_criteria: { criteria: m.criteria, cupos: m.cupos },
        last_seen_at: now,
        updated_at: now,
      }, { onConflict: 'flight_id,package_id', ignoreDuplicates: false })
      if (!error) upserted++
      else console.error('[links] upsert falló:', error.message)
    }
  }
  return { scanned: ids.length, upserted, packagesWithLinks: matches.size }
}

/** Vínculos vigentes de varios paquetes, con los cupos actuales de cada vuelo. */
export async function loadPackageLinks(db: Db, packageIds: number[]): Promise<Map<number, PackageLink[]>> {
  const result = new Map<number, PackageLink[]>()
  if (packageIds.length === 0) return result

  const staleBefore = new Date(Date.now() - LINK_STALE_DAYS * 86_400_000).toISOString()
  const { data: rows } = await db
    .from('flight_package_links')
    .select('id, flight_id, package_id, confidence, source, confirmed, rejected, last_seen_at, match_criteria')
    .in('package_id', packageIds)
    .eq('rejected', false)
    .or(`confirmed.eq.true,source.neq.auto_match,last_seen_at.gte.${staleBefore}`)

  const links = (rows ?? []) as Array<{ id: number; flight_id: number; package_id: number; confidence: PackageLink['confidence']; source: PackageLink['source']; confirmed: boolean; rejected: boolean; last_seen_at: string; match_criteria: Record<string, unknown> }>
  if (links.length === 0) return result

  const flightIds = [...new Set(links.map(l => l.flight_id))]
  const [flights, reviews] = await Promise.all([
    loadFlightsForMatch(db, { activeOnly: false, flightIds }),
    db.from('flight_package_reviews').select('flight_id, package_id, decision, sold_at_review, quantity_at_review').in('flight_id', flightIds),
  ])
  const flightById = new Map(flights.map(f => [f.id, f]))
  const reviewRows = (reviews.data ?? []) as Array<{ flight_id: number; package_id: number; decision: string; sold_at_review: number | null; quantity_at_review: number | null }>

  for (const l of links) {
    const flight = flightById.get(l.flight_id) ?? null
    const cupos = flight ? calculateCupos(flight.modalities) : null
    const review = reviewRows.find(r => r.flight_id === l.flight_id && r.package_id === l.package_id && r.decision === 'kept_visible')
    const keptVisible = Boolean(review && cupos && review.sold_at_review === cupos.sold && review.quantity_at_review === cupos.total)
    const item: PackageLink = {
      id: l.id,
      flightId: l.flight_id,
      packageId: l.package_id,
      confidence: l.confidence,
      source: l.source,
      confirmed: l.confirmed,
      rejected: l.rejected,
      lastSeenAt: l.last_seen_at,
      matchCriteria: l.match_criteria ?? {},
      flight: flight ? { baseId: flight.base_id, name: flight.name, startDate: flight.start_date, endDate: flight.end_date, active: flight.active ?? null, legType: flight.leg_type, pairedFlightId: flight.paired_flight_id } : null,
      cupos,
      keptVisible,
    }
    if (!result.has(l.package_id)) result.set(l.package_id, [])
    result.get(l.package_id)!.push(item)
  }
  return result
}

/** Paquetes vinculados a un vuelo (para el job cupo.sold_out). */
export async function packagesLinkedToFlight(db: Db, flightId: number): Promise<number[]> {
  const { data: flight } = await db.from('flights').select('id, paired_flight_id').eq('id', flightId).maybeSingle()
  const ids = [flightId, (flight as { paired_flight_id?: number | null } | null)?.paired_flight_id ?? null].filter((x): x is number => x !== null)
  const { data } = await db.from('flight_package_links').select('package_id').in('flight_id', ids).eq('rejected', false)
  return [...new Set(((data ?? []) as Array<{ package_id: number }>).map(r => r.package_id))]
}

export async function setLinkDecision(db: Db, linkId: number, decision: 'confirm' | 'reject', actor: string | null): Promise<void> {
  const now = new Date().toISOString()
  const patch = decision === 'confirm'
    ? { confirmed: true, rejected: false, confirmed_by: actor, confirmed_at: now, updated_at: now }
    : { confirmed: false, rejected: true, confirmed_by: actor, confirmed_at: now, updated_at: now }
  const { error } = await db.from('flight_package_links').update(patch).eq('id', linkId)
  if (error) throw new Error(`No se pudo actualizar el vínculo ${linkId}: ${error.message}`)
}
