import { getPackageDetail, getPackageInfo } from '@/lib/travelcompositor/client'
import { extractCosts, importPackageDestinations, importPackageHotels, importPackageTransports } from '@/lib/packages/import'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { calculateCupos, loadFlightsForMatch } from '@/lib/packages/flight-match'
import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { logEvent } from '@/lib/logs'
import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>
type Actor = { id: string | null; email: string | null } | null

export type SwitchToSystemResult =
  | { ok: true; oldPrice: number | null; newPrice: number; variancePct: number | null; releasedLinks: number; requoteJobId: number | null }
  | { ok: false; status: 404 | 409 | 500; reason: string }

/**
 * Un cupo agotado se reemplazó en TC por una tarifa de sistema (se le sacó el
 * "fijo" al aéreo, se buscó una tarifa similar, se actualizó y guardó). El ID,
 * la URL indexada y los anuncios de Meta siguen iguales; lo que cambia en HUB
 * es que el paquete deja de ser de cupo y pasa a monitorearse contra el
 * mercado con el precio nuevo como objetivo.
 *
 * Orden: primero se relee TC. Si TC todavía devuelve el aéreo como contrato
 * es que el cambio no se hizo, y no se toca nada más.
 */
export async function switchPackageToSystem(db: Db, packageId: number, actor: Actor): Promise<SwitchToSystemResult> {
  const { data: pkg } = await db
    .from('packages')
    .select('id, tc_package_id, title, current_price_per_pax, currency, adults_count, children_count, send_to_marketing')
    .eq('id', packageId)
    .maybeSingle()
  if (!pkg) return { ok: false, status: 404, reason: `Paquete ${packageId} no existe` }

  let info, detail
  try {
    ;[info, detail] = await Promise.all([getPackageInfo(pkg.tc_package_id), getPackageDetail(pkg.tc_package_id)])
  } catch (err) {
    return { ok: false, status: 500, reason: `No se pudo leer el paquete en TC: ${err instanceof Error ? err.message : String(err)}` }
  }
  if (!info) return { ok: false, status: 404, reason: `TC no devolvió el paquete ${pkg.tc_package_id}` }

  // 1) Lo que TC tiene hoy: aéreo, hoteles, destinos.
  const adults = info.counters.adults ?? pkg.adults_count ?? 2
  const children = info.counters.children ?? pkg.children_count ?? 0
  await importPackageDestinations(db, pkg.id, info.destinations)
  await importPackageTransports(db, pkg.id, detail, adults, children)
  await importPackageHotels(db, pkg.id, detail, adults, children)

  // 2) ¿Sigue siendo cupo? Entonces el cambio en TC no se hizo.
  if ((await getCupoPackageIds(db, [pkg.id])).has(pkg.id)) {
    const { data: contract } = await db.from('package_transports').select('supplier_name, transport_number, departure_date').eq('package_id', pkg.id).not('supplier_name', 'is', null)
    const who = [...new Set(((contract ?? []) as Array<{ supplier_name: string }>).map(t => t.supplier_name))].join(', ')
    return {
      ok: false,
      status: 409,
      reason: `TC sigue devolviendo el aéreo como contrato${who ? ` (${who})` : ''}. En el paquete vacacional sacale el "fijo" al aéreo, buscá la tarifa de sistema, actualizá y guardá; después volvé a tocar este botón.`,
    }
  }

  // 3) Precio y fechas nuevos, y el paquete pasa a sistema con monitoreo.
  const costs = extractCosts(detail)
  const oldPrice = pkg.current_price_per_pax as number | null
  const newPrice = info.pricePerPerson.amount
  const priceChanged = oldPrice !== null && oldPrice !== newPrice
  const variancePct = priceChanged && oldPrice ? Math.round(((newPrice - oldPrice) / oldPrice) * 10000) / 100 : null
  const now = new Date().toISOString()
  const actorLabel = actor?.email ?? 'HUB'
  const update: Record<string, unknown> = {
    title: info.title,
    large_title: info.largeTitle || null,
    departure_date: info.departureDate || null,
    date_range_start: info.dateSettings?.availRange?.start || null,
    date_range_end: info.dateSettings?.availRange?.end || null,
    current_price_per_pax: newPrice,
    total_price: info.totalPrice.amount,
    currency: info.pricePerPerson.currency || pkg.currency || 'USD',
    price_variance_pct: variancePct,
    needs_manual_quote: false,
    adults_count: info.counters.adults,
    children_count: info.counters.children,
    nights_count: info.counters.hotelNights,
    transports_count: info.counters.transports,
    hotels_count: info.counters.hotels,
    tours_count: info.counters.closedTours,
    tc_active: info.active,
    tc_idea_url: info.ideaUrl || null,
    air_cost: costs.airCost,
    land_cost: costs.landCost,
    agency_fee: costs.agencyFee,
    flight_departure_date: costs.flightDepartureDate,
    airline_code: costs.airlineCode,
    airline_name: costs.airlineName,
    flight_numbers: costs.flightNumbers,
    last_sync_at: now,
    is_cupo: false,
    switched_to_system_at: now,
    switched_to_system_by: actorLabel,
    monitor_enabled: true,
    requote_status: 'pending',
    target_price: newPrice,
    requote_price: null,
    requote_variance_pct: null,
    requote_note: `Pasó de cupo a aéreo de sistema el ${now.slice(0, 10)} (${actorLabel})${priceChanged ? `: USD ${oldPrice} → USD ${newPrice}` : ''}. Monitoreo encendido con este precio como objetivo.`,
    requote_source: 'cotizador',
  }
  if (priceChanged) {
    update.original_price_per_pax = oldPrice
    update.last_price_change_at = now
    await db.from('package_price_history').insert({ package_id: pkg.id, price_per_pax: newPrice, total_price: info.totalPrice.amount, currency: update.currency, previous_price: oldPrice, variance_amount: newPrice - (oldPrice ?? 0), variance_pct: variancePct })
    if (pkg.send_to_marketing) {
      // La creatividad suele mostrar el precio: que diseño lo sepa (el guard lo propone igual por desvío de precio).
      update.creative_update_needed = true
      update.creative_update_reason = 'price_change'
      update.creative_update_requested_at = now
    }
  }
  const { error: updateError } = await db.from('packages').update(update).eq('id', pkg.id)
  if (updateError) return { ok: false, status: 500, reason: `No se pudo actualizar el paquete: ${updateError.message}` }

  // 4) Los vínculos con el cupo quedan liberados y la revisión registrada, así
  //    la tarea de cupos agotados y el guard dejan de mirar este paquete.
  const { data: links } = await db.from('flight_package_links').select('id, flight_id, match_criteria').eq('package_id', pkg.id).eq('rejected', false)
  const linkRows = (links ?? []) as Array<{ id: number; flight_id: number; match_criteria: Record<string, unknown> | null }>
  for (const l of linkRows) {
    await db.from('flight_package_links').update({ rejected: true, match_criteria: { ...(l.match_criteria ?? {}), released: 'switched_to_system', released_at: now, released_by: actorLabel }, updated_at: now }).eq('id', l.id)
  }
  if (linkRows.length > 0) {
    const flights = await loadFlightsForMatch(db, { activeOnly: false })
    const flightIds = new Set<number>()
    for (const l of linkRows) {
      flightIds.add(l.flight_id)
      const paired = flights.find(f => f.id === l.flight_id)?.paired_flight_id
      if (paired) flightIds.add(paired)
    }
    const rows = [...flightIds].map(flightId => {
      const flight = flights.find(f => f.id === flightId)
      const cupos = flight ? calculateCupos(flight.modalities) : null
      return { flight_id: flightId, package_id: pkg.id, decision: 'switched_to_system', note: 'El cupo se reemplazó por una tarifa de sistema', sold_at_review: cupos?.sold ?? null, quantity_at_review: cupos?.total ?? null, reviewed_by: actor?.id ?? null, reviewed_by_email: actor?.email ?? null, reviewed_at: now }
    })
    const { error: reviewError } = await db.from('flight_package_reviews').upsert(rows, { onConflict: 'flight_id,package_id' })
    if (reviewError) console.error('[switch-to-system] No se pudo registrar la revisión:', reviewError.message)
  }

  // 5) Primer monitoreo ya, y vínculos recalculados con el aéreo nuevo.
  let requoteJobId: number | null = null
  try {
    const job = await enqueueJob(db, { kind: 'package.requote', payload: { packageId: pkg.id, trigger: 'switch_to_system' }, priority: MANUAL_PRIORITY, dedupeKey: `package.requote:manual:${pkg.id}`, entityType: 'package', entityId: pkg.id, createdBy: actorLabel })
    requoteJobId = job.id
    await enqueueJob(db, { kind: 'cupo.link_refresh', payload: { packageIds: [pkg.id] }, priority: MANUAL_PRIORITY, dedupeKey: `cupo.link_refresh:switch:${pkg.id}:${Date.now()}`, createdBy: actorLabel })
  } catch (err) {
    console.error('[switch-to-system] No se pudo encolar el monitoreo:', err instanceof Error ? err.message : err)
  }

  await logEvent(db, {
    source: 'cupos',
    action: 'package.switched_to_system',
    message: `${pkg.tc_package_id} pasó de cupo a aéreo de sistema${priceChanged ? ` (USD ${oldPrice} → USD ${newPrice})` : ''}; ${linkRows.length} vínculo(s) con cupo liberados; monitoreo encendido`,
    entityType: 'package',
    entityId: pkg.id,
    entityLabel: `${pkg.tc_package_id} · ${pkg.title}`,
    details: { oldPrice, newPrice, variancePct, releasedLinks: linkRows.length, requoteJobId, airline: costs.airlineCode, flightNumbers: costs.flightNumbers },
  }, actor)

  return { ok: true, oldPrice, newPrice, variancePct, releasedLinks: linkRows.length, requoteJobId }
}
