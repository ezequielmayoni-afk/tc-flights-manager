import { quoteMulti, type QuoteMultiRequest, type QuoteMultiResponse } from '@/lib/cotizador/client'
import { summarizeQuote, summaryToFareCell, type QuoteSummary } from '@/lib/producto/idea-builder'
import { loadProfiles } from '@/lib/producto/profiles'
import { decideStopover } from '@/lib/producto/stopover-rule'
import { buildPackageQuoteRequest, pickMatchingOption } from '@/lib/requote/package-request'
import { seasonWindowFor } from '@/lib/requote/season-window'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'
import { loadPackageForRequote, type LoadedPackage } from './package-requote'

async function runQuote(db: Db, packageId: number, request: QuoteMultiRequest, instance: 'emisivo' | 'nacional', jobId: number): Promise<{ runId: number | null; response: QuoteMultiResponse | null; summary: QuoteSummary | null; error: string | null }> {
  const { data: run } = await db.from('quote_runs').insert({ purpose: 'requote_alt', package_id: packageId, instance, request, status: 'pending', job_id: jobId, created_by: `job:${jobId}` }).select('id').single()
  const runId = (run as { id: number } | null)?.id ?? null
  try {
    const response = await quoteMulti(db, request, { instance, jobId })
    const summary = summarizeQuote(response)
    if (runId) await db.from('quote_runs').update({ status: ['ok', 'sin_disponibilidad', 'parametros_invalidos', 'error_upstream', 'timeout'].includes(response.status) ? response.status : 'error', response, price_pp: summary.pricePp, total_price: summary.totalPrice, currency: summary.currency, hotel_name: summary.hotelName, hotel_code: summary.hotelCode, board: summary.board, stars: summary.stars, regimen_confirmed: summary.regimenConfirmed, airline: summary.airline, direct: summary.direct, departure_date: summary.departureDate, return_date: summary.returnDate, warnings: summary.warnings, elapsed_seconds: summary.elapsedSeconds, completed_at: new Date().toISOString() }).eq('id', runId)
    return { runId, response, summary, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (runId) await db.from('quote_runs').update({ status: 'error', warnings: [message], completed_at: new Date().toISOString() }).eq('id', runId)
    return { runId, response: null, summary: null, error: message }
  }
}

/** El perfil del paquete: por código asignado, o por el destino de TC del primer tramo. */
async function findProfile(db: Db, pkg: LoadedPackage) {
  const profiles = await loadProfiles(db)
  if (pkg.row.destination_profile_code) {
    const p = profiles.find(x => x.code === pkg.row.destination_profile_code)
    if (p) return p
  }
  const dest = [...pkg.destinations].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))[0]?.destination_code?.toUpperCase()
  if (!dest) return null
  return profiles.find(x => x.tc_destination_code?.toUpperCase() === dest) ?? profiles.find(x => x.code.toUpperCase() === dest) ?? profiles.find(x => x.iata_airport?.toUpperCase() === dest) ?? null
}

async function fail(db: Db, packageId: number, trigger: string, reason: string, extra: Record<string, unknown> = {}) {
  await db.from('requote_alternatives').update({ status: 'superseded' }).eq('package_id', packageId).in('status', ['proposed', 'failed'])
  await db.from('requote_alternatives').insert({ package_id: packageId, trigger, status: 'failed', reason, ...extra })
}

/**
 * Cupo agotado → fecha alternativa en la misma temporada. Le pide al
 * cotizador la misma combinación del paquete (hoteles, noches, pasajeros)
 * dentro de la ventana de la temporada del perfil, deja que elija la mejor
 * fecha por precio y duración, aplica la regla directo/escala del perfil y
 * guarda la propuesta para que alguien la apruebe.
 */
export const packageAlternativeDateHandler: HandlerDefinition = {
  kind: 'package.alternative_date',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls],
  provider: 'cotizador',
  description: 'Cupo agotado: busca la mejor fecha de la misma temporada con aéreo de sistema y la propone',
  handler: async ({ db, job, heartbeat, log }) => {
    const packageId = Number(job.payload.packageId)
    const trigger = String(job.payload.trigger ?? 'manual')
    if (!packageId) return { ok: false, error: 'payload.packageId obligatorio', retry: false }
    const pkg = await loadPackageForRequote(db, packageId)
    if (!pkg) return { ok: false, error: `Paquete ${packageId} no existe`, retry: false }
    const label = `SIV ${pkg.tc_package_id}`
    const profile = await findProfile(db, pkg)
    if (!profile) {
      await fail(db, packageId, trigger, 'El paquete no tiene perfil de destino: cargalo en Perfiles')
      return { ok: true, result: { packageId, status: 'failed', reason: 'sin perfil' } }
    }
    const departure = pkg.flight_departure_date ?? pkg.departure_date
    if (!departure) {
      await fail(db, packageId, trigger, 'El paquete no tiene fecha de salida')
      return { ok: true, result: { packageId, status: 'failed', reason: 'sin fecha' } }
    }
    const today = new Date().toISOString().slice(0, 10)
    const window = seasonWindowFor(departure, profile.high_season_months, { today })
    if (!window) {
      await fail(db, packageId, trigger, `La temporada de la salida (${departure}) ya pasó: no hay fechas para proponer`, { current_departure: departure })
      return { ok: true, result: { packageId, status: 'failed', reason: 'ventana vencida' } }
    }

    // Se cotiza como si fuera de sistema (el cupo ya no sirve) dentro de la ventana.
    const build = buildPackageQuoteRequest({ ...pkg, isCupo: false })
    if (!build.ok) {
      await fail(db, packageId, trigger, build.reason, { current_departure: departure, season_kind: window.kind, window_from: window.from, window_to: window.to })
      return { ok: true, result: { packageId, status: 'failed', reason: build.reason } }
    }
    const request: QuoteMultiRequest = { ...build.request, rango_desde: window.from, rango_hasta: window.to, max_opciones: 3 }
    delete request.fecha_inicio
    const directOnly = profile.direct_required
    if (directOnly) request.vuelo_directo = true

    const a = await runQuote(db, packageId, request, build.instance, job.id)
    await heartbeat()
    if (!a.summary || !a.summary.ok || a.summary.pricePp === null) {
      const reason = a.error ?? a.summary?.diagnostico ?? `El cotizador devolvió ${a.summary?.status ?? 'sin respuesta'}`
      await fail(db, packageId, trigger, reason, { quote_run_id: a.runId, current_departure: departure, season_kind: window.kind, window_from: window.from, window_to: window.to })
      await log(`${label}: sin fecha alternativa: ${reason}`, { packageId, runId: a.runId }, 'warning')
      return a.error ? { ok: false, error: reason, retry: true } : { ok: true, result: { packageId, status: 'failed', reason } }
    }

    // Regla directo/escala del perfil, igual que en las ideas: segunda cotización sólo-directo en la fecha elegida.
    let chosen = a
    let stopoverNote: string | null = null
    if (!directOnly && profile.stopover_threshold_pct !== null && a.summary.direct === false && a.summary.departureDate) {
      const b = await runQuote(db, packageId, { ...build.request, fecha_inicio: a.summary.departureDate, vuelo_directo: true, max_opciones: 3 }, build.instance, job.id)
      await heartbeat()
      const cellA = summaryToFareCell(a.summary)
      const cellB = b.summary?.ok && b.summary.direct === true ? summaryToFareCell(b.summary) : null
      if (b.summary?.ok && b.summary.direct !== true) stopoverNote = 'No hay vuelo directo en esta ruta: se toma la mejor opción con escala'
      else {
        const decision = decideStopover(profile, { nights: pkg.nights_count ?? 7, hasKids: (pkg.children_count ?? 0) > 0, originInterior: !['BUE', 'EZE', 'AEP'].includes(request.origen) }, cellB, cellA)
        stopoverNote = decision.reason
        if (decision.choice === 'direct' && cellB) chosen = b
      }
    }

    const s = chosen.summary!
    const picked = chosen.response ? pickMatchingOption(chosen.response, build.expectedHotels) : { option: null, match: 'unknown' as const }
    const pricePp = picked.option?.precio_pp_final ?? s.pricePp
    const currentPrice = pkg.row.target_price ?? pkg.row.current_price_per_pax
    const variancePct = currentPrice && pricePp !== null ? Math.round(((pricePp - currentPrice) / currentPrice) * 10000) / 100 : null
    const hotelNames = build.expectedHotels
    const notes: string[] = []
    if (picked.match === 'missing') notes.push(`El hotel ${hotelNames[0] ?? 'del paquete'} no apareció en esa fecha; la opción más cercana fue ${picked.option?.hotel?.nombre ?? s.hotelName ?? '?'}`)
    if (stopoverNote) notes.push(stopoverNote)
    if (s.departureDate === departure) notes.push('La mejor fecha es la misma salida actual, con aéreo de sistema')

    await db.from('requote_alternatives').update({ status: 'superseded' }).eq('package_id', packageId).in('status', ['proposed', 'failed'])
    const { data: inserted } = await db.from('requote_alternatives').insert({
      package_id: packageId, quote_run_id: chosen.runId, trigger, season_kind: window.kind, window_from: window.from, window_to: window.to,
      current_departure: departure, current_price_pp: currentPrice, proposed_departure: s.departureDate, proposed_return: s.returnDate, nights: pkg.nights_count,
      price_pp: pricePp, currency: s.currency || 'USD', variance_pct: variancePct, airline: s.airline, flight_numbers: s.flightNumbers, direct: s.direct, stops: s.stops,
      hotel_names: hotelNames, hotel_matched: picked.match === 'matched', alternatives: s.alternatives, stopover_note: notes.join('. ') || null,
      status: 'proposed', reason: `${window.label}: mejor fecha ${s.departureDate} (${s.dateReason ?? 'elegida por el cotizador'})`, created_by: `job:${job.id}`,
    }).select('id').single()
    const altId = (inserted as { id: number } | null)?.id ?? null
    await log(`${label}: fecha alternativa propuesta ${s.departureDate} → ${s.returnDate} · ${s.airline ?? '?'} ${s.direct ? 'directo' : 'con escala'} · USD ${pricePp} pp (hoy ${currentPrice}, ${variancePct !== null ? `${variancePct > 0 ? '+' : ''}${variancePct}%` : '?'}) · ${window.label}`, { packageId, altId, runId: chosen.runId, notes })
    return { ok: true, result: { packageId, status: 'proposed', altId, proposedDeparture: s.departureDate, pricePp, currentPrice, variancePct, direct: s.direct, airline: s.airline, hotelMatch: picked.match, window } }
  },
}
