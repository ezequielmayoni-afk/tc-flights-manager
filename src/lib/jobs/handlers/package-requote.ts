import { quoteMulti, type QuoteMultiResponse } from '@/lib/cotizador/client'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { importPackageHotels } from '@/lib/packages/import'
import { getPackageDetail } from '@/lib/travelcompositor/client'
import { getRequoteVarianceThresholdPct } from '@/lib/packages/thresholds'
import { summarizeQuote } from '@/lib/producto/idea-builder'
import { evaluateRequote } from '@/lib/requote/evaluate'
import { buildPackageQuoteRequest, pickMatchingOption, type PackageForRequote } from '@/lib/requote/package-request'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'

interface PackageRow {
  id: number; tc_package_id: number; title: string | null; origin_code: string | null; departure_date: string | null; flight_departure_date: string | null
  nights_count: number | null; adults_count: number | null; children_count: number | null; tours_count: number | null
  monitor_enabled: boolean | null; tc_active: boolean | null; target_price: number | null; current_price_per_pax: number | null
  requote_status: string | null; destination_profile_code: string | null
}

async function loadPackage(db: Db, packageId: number): Promise<PackageForRequote & { row: PackageRow } | null> {
  const { data } = await db.from('packages').select('id, tc_package_id, title, origin_code, departure_date, flight_departure_date, nights_count, adults_count, children_count, tours_count, monitor_enabled, tc_active, target_price, current_price_per_pax, requote_status, destination_profile_code').eq('id', packageId).maybeSingle()
  if (!data) return null
  const row = data as PackageRow
  const [{ data: hotels }, { data: transports }, { data: destinations }, cupos, profile] = await Promise.all([
    db.from('package_hotels').select('hotel_name, hotel_category, stars, nights, board_type, board_name, destination_code, check_in_date, sort_order').eq('package_id', packageId),
    db.from('package_transports').select('transport_type, origin_code, departure_date, num_segments, sort_order, day').eq('package_id', packageId),
    db.from('package_destinations').select('destination_code, destination_name, sort_order').eq('package_id', packageId),
    getCupoPackageIds(db, [packageId]),
    row.destination_profile_code ? db.from('destination_profiles').select('cotizador_instance').eq('code', row.destination_profile_code).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const instance = (profile.data as { cotizador_instance?: string } | null)?.cotizador_instance
  return {
    row,
    id: row.id, tc_package_id: row.tc_package_id, origin_code: row.origin_code, departure_date: row.departure_date, flight_departure_date: row.flight_departure_date,
    nights_count: row.nights_count, adults_count: row.adults_count, children_count: row.children_count, tours_count: row.tours_count,
    hotels: (hotels ?? []) as PackageForRequote['hotels'], transports: (transports ?? []) as PackageForRequote['transports'], destinations: (destinations ?? []) as PackageForRequote['destinations'],
    profile: instance === 'nacional' || instance === 'emisivo' ? { cotizador_instance: instance } : null,
    isCupo: cupos.has(packageId),
  }
}

/**
 * Recotiza un paquete publicado con el cotizador-bot y decide si sigue al
 * día o pasa a revisión manual. Reemplaza al tc-requote-bot (Playwright con
 * sesión de agente en siviajo.com): mismos campos en `packages`, misma tabla
 * de logs, misma regla del umbral; lo único que no hace es "Actualizar y
 * guardar idea", que necesitaba la sesión.
 */
export const packageRequoteHandler: HandlerDefinition = {
  kind: 'package.requote',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls],
  provider: 'cotizador',
  description: 'Monitoreo de precio: recotiza un paquete publicado con el cotizador y lo pasa a revisión manual si subió más que el umbral',
  handler: async ({ db, job, log }) => {
    const packageId = Number(job.payload.packageId)
    if (!packageId) return { ok: false, error: 'payload.packageId obligatorio', retry: false }
    const pkg = await loadPackage(db, packageId)
    if (!pkg) return { ok: false, error: `Paquete ${packageId} no existe`, retry: false }
    const now = new Date().toISOString()
    const label = `SIV ${pkg.tc_package_id}`

    if (!pkg.row.monitor_enabled || !pkg.row.tc_active) {
      return { ok: true, result: { packageId, skipped: 'sin monitoreo o dado de baja' } }
    }

    // Hoteles importados sin nombre (TC no lo mandaba en su momento): se
    // vuelven a traer del detalle de TC antes de cotizar, para poder comparar
    // contra el mismo hotel y no contra "el más barato".
    let build = buildPackageQuoteRequest(pkg)
    if (build.ok && build.expectedHotels.length === 0 && pkg.hotels.length > 0) {
      try {
        await importPackageHotels(db, packageId, await getPackageDetail(pkg.tc_package_id), pkg.adults_count ?? 2, pkg.children_count ?? 0)
        const refreshed = await loadPackage(db, packageId)
        if (refreshed) {
          build = buildPackageQuoteRequest(refreshed)
          await log(`${label}: hoteles reimportados de TC (${refreshed.hotels.map(h => h.hotel_name ?? 'sin nombre').join(' + ')})`, { packageId })
        }
      } catch (err) {
        await log(`${label}: no se pudieron reimportar los hoteles de TC: ${err instanceof Error ? err.message : String(err)}`, { packageId }, 'warning')
      }
    }
    if (!build.ok) {
      await db.from('packages').update({ requote_note: build.reason, requote_source: 'cotizador', last_requote_at: now }).eq('id', packageId)
      await db.from('package_requote_logs').insert({ package_id: packageId, previous_price: pkg.row.target_price ?? pkg.row.current_price_per_pax, new_price: null, variance_pct: null, action_taken: 'skipped', error_message: build.reason, source: 'cotizador' })
      await log(`${label}: no se recotiza: ${build.reason}`, { packageId }, 'warning')
      return { ok: true, result: { packageId, skipped: build.reason } }
    }

    const reference = pkg.row.target_price ?? pkg.row.current_price_per_pax
    const threshold = await getRequoteVarianceThresholdPct(db)
    const { data: run } = await db.from('quote_runs').insert({ purpose: 'requote', package_id: packageId, instance: build.instance, request: build.request, status: 'pending', job_id: job.id, created_by: `job:${job.id}` }).select('id').single()
    const runId = (run as { id: number } | null)?.id ?? null

    let response: QuoteMultiResponse
    try {
      response = await quoteMulti(db, build.request, { instance: build.instance, jobId: job.id })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (runId) await db.from('quote_runs').update({ status: 'error', warnings: [message], completed_at: new Date().toISOString() }).eq('id', runId)
      await db.from('packages').update({ requote_note: `Error del cotizador: ${message}`, requote_source: 'cotizador', last_requote_at: now }).eq('id', packageId)
      await db.from('package_requote_logs').insert({ package_id: packageId, previous_price: reference, new_price: null, variance_pct: null, action_taken: 'error', error_message: message, source: 'cotizador', quote_run_id: runId })
      return { ok: false, error: `${label}: ${message}`, retry: true }
    }

    const picked = pickMatchingOption(response, build.expectedHotels)
    const summary = summarizeQuote(response)
    const newPrice = picked.option?.precio_pp_final ?? null
    const quotedHotel = picked.option?.hotel?.nombre ?? summary.hotelName
    if (runId) {
      await db.from('quote_runs').update({
        status: ['ok', 'sin_disponibilidad', 'parametros_invalidos', 'error_upstream', 'timeout'].includes(response.status) ? response.status : 'error',
        response, price_pp: newPrice, total_price: picked.option?.precio_total_final ?? null, currency: response.moneda ?? 'USD',
        hotel_name: quotedHotel, hotel_code: picked.option?.hotel?.code ?? null, board: picked.option?.hotel?.regimen ?? summary.board, stars: picked.option?.hotel?.estrellas ?? summary.stars,
        regimen_confirmed: picked.option ? !picked.option.regimen_no_confirmado : null, airline: summary.airline, direct: summary.direct,
        departure_date: summary.departureDate, return_date: summary.returnDate, warnings: summary.warnings, elapsed_seconds: summary.elapsedSeconds,
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
    }

    const ev = evaluateRequote({ referencePrice: reference, newPrice, thresholdPct: threshold, hotelMatch: picked.match, expectedHotel: build.expectedHotels[0] ?? null, quotedHotel, quoteStatus: response.status, diagnostico: summary.diagnostico, directNotAvailable: Boolean(build.request.vuelo_directo) && summary.direct === false })
    await db.from('packages').update({
      requote_status: ev.status === 'pending' ? (pkg.row.requote_status ?? 'pending') : ev.status,
      ...(newPrice !== null ? { requote_price: newPrice, requote_variance_pct: ev.variancePct } : {}),
      requote_note: ev.note, requote_source: 'cotizador', last_requote_at: now,
    }).eq('id', packageId)
    await db.from('package_requote_logs').insert({ package_id: packageId, previous_price: reference, new_price: newPrice, variance_pct: ev.variancePct, action_taken: ev.action, error_message: ev.action === 'error' ? ev.note : null, source: 'cotizador', quote_run_id: runId })
    await log(`${label}: ${ev.status} · ${ev.note}`, { packageId, runId, newPrice, reference, variancePct: ev.variancePct, hotelMatch: picked.match, direct: summary.direct, airline: summary.airline }, ev.status === 'needs_manual' ? 'warning' : 'info')
    return { ok: true, result: { packageId, tcPackageId: pkg.tc_package_id, status: ev.status, action: ev.action, pricePp: newPrice, reference, variancePct: ev.variancePct, hotelMatch: picked.match, note: ev.note, runId } }
  },
}
