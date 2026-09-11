import { probeFlights, quoteMulti, type ProbeOption, type QuoteMultiRequest, type QuoteMultiResponse } from '@/lib/cotizador/client'
import { originTcCode } from '@/lib/packages/public-url'
import { summarizeQuote, type QuoteSummary } from '@/lib/producto/idea-builder'
import { loadProfiles } from '@/lib/producto/profiles'
import type { FareCell } from '@/lib/producto/types'
import { addDays, candidateDates, rankDates, type RankedDate } from '@/lib/requote/date-candidates'
import { buildPackageQuoteRequest, pickMatchingOption } from '@/lib/requote/package-request'
import { seasonWindowFor } from '@/lib/requote/season-window'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'
import { loadPackageForRequote, type LoadedPackage } from './package-requote'

/** Sondas de vuelo de menos de una semana se reutilizan (vuelos.siviajo.com las deja hechas). */
const PROBE_REUSE_DAYS = 7
const MAX_DATES = 9
/** Cotizaciones completas (hotel + vuelo) sólo para las mejores fechas del aéreo. */
const FULL_QUOTES = 2

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

const optionIsDirect = (o: ProbeOption) => o.stopsOut === 0 && o.stopsBack === 0
const optionToCell = (date: string, o: ProbeOption): FareCell => ({ date, pricePerPax: o.pricePp, currency: o.currency || 'USD', direct: optionIsDirect(o), durationMinutes: o.durationOutMin, airline: o.airline || null, flightNumbers: [o.flightOut, o.flightBack].filter(Boolean), stops: o.stopsOut ?? undefined, source: 'cotizador_probe' })

/**
 * Sondas de vuelo por fecha: primero las que ya hizo vuelos.siviajo.com esta
 * semana para la misma ruta y noches; si no hay, una sonda nueva que también
 * queda guardada para la landing.
 */
async function flightCellsFor(db: Db, args: { originTc: string; destTc: string; date: string; nights: number; adults: number; childrenAges: number[]; jobId: number }): Promise<{ cells: FareCell[]; reused: boolean }> {
  const returnDate = addDays(args.date, args.nights)
  const since = new Date(Date.now() - PROBE_REUSE_DAYS * 86400000).toISOString()
  const { data: existing } = await db.from('flight_price_probes').select('price_per_pax, currency, airline, flight_numbers, direct, stops, duration_minutes').eq('origin', args.originTc).eq('destination', args.destTc).eq('departure_date', args.date).eq('nights', args.nights).eq('status', 'ok').gte('probed_at', since).not('price_per_pax', 'is', null)
  const rows = (existing ?? []) as Array<{ price_per_pax: number | string; currency: string | null; airline: string | null; flight_numbers: string[] | null; direct: boolean | null; stops: number | null; duration_minutes: number | null }>
  if (rows.length > 0) {
    return { reused: true, cells: rows.map(r => ({ date: args.date, pricePerPax: Number(r.price_per_pax), currency: r.currency || 'USD', direct: r.direct === true, durationMinutes: r.duration_minutes, airline: r.airline, flightNumbers: r.flight_numbers ?? undefined, stops: r.stops ?? undefined, source: 'cotizador_probe' as const })) }
  }
  const result = await probeFlights(db, { originCode: args.originTc, destCode: args.destTc, departDate: args.date, returnDate, adults: args.adults, childrenAges: args.childrenAges, topN: 6 }, { jobId: args.jobId })
  const now = new Date().toISOString()
  const expires = new Date(Date.now() + 24 * 3600000).toISOString()
  const base = { origin: args.originTc, destination: args.destTc, destination_code: args.destTc, departure_date: args.date, return_date: returnDate, nights: args.nights, adults: args.adults, source: 'cotizador_probe', job_id: args.jobId, probed_at: now, expires_at: expires, elapsed_ms: result.elapsedMs }
  if (result.status !== 'ok' || result.options.length === 0) {
    await db.from('flight_price_probes').insert({ ...base, status: result.status === 'ok' ? 'empty' : result.status, currency: 'USD', error: result.status === 'error' ? result.error : null })
    return { reused: false, cells: [] }
  }
  await db.from('flight_price_probes').insert(result.options.map(o => ({ ...base, status: 'ok', price_per_pax: o.pricePp, currency: o.currency || 'USD', airline: o.airline || null, flight_numbers: [o.flightOut, o.flightBack].filter(Boolean), direct: optionIsDirect(o), stops: o.stopsOut, stops_back: o.stopsBack, duration_minutes: o.durationOutMin, duration_back_minutes: o.durationBackMin, fare_family: o.fareFamily || null, checked_bag: o.checkedBag, carry_on: o.carryOn })))
  return { reused: false, cells: result.options.map(o => optionToCell(args.date, o)) }
}

/**
 * Cupo agotado → fecha alternativa en la misma temporada. Sondea el aéreo
 * de sistema fecha por fecha dentro de la ventana de la temporada del
 * perfil (mismo mecanismo que vuelos.siviajo.com), elige por precio con la
 * regla directo/escala del perfil, cotiza el paquete completo (mismos
 * hoteles, noches y pasajeros) en las dos mejores fechas y propone la mejor.
 */
export const packageAlternativeDateHandler: HandlerDefinition = {
  kind: 'package.alternative_date',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls],
  provider: 'cotizador',
  description: 'Cupo agotado: sondea las fechas de la misma temporada con aéreo de sistema y propone la mejor, cotizada completa',
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
    const meta = { current_departure: departure, season_kind: window?.kind, window_from: window?.from, window_to: window?.to }
    if (!window) {
      await fail(db, packageId, trigger, `La temporada de la salida (${departure}) ya pasó: no hay fechas para proponer`, meta)
      return { ok: true, result: { packageId, status: 'failed', reason: 'ventana vencida' } }
    }
    const build = buildPackageQuoteRequest({ ...pkg, isCupo: false })
    if (!build.ok) {
      await fail(db, packageId, trigger, build.reason, meta)
      return { ok: true, result: { packageId, status: 'failed', reason: build.reason } }
    }
    const nights = pkg.nights_count ?? build.request.tramos.reduce((n, t) => n + t.noches, 0)
    const originTc = originTcCode(build.request.origen)
    const destTc = build.request.tramos[0].destino.replace(/^Destination::/, '').toUpperCase()
    const adults = build.request.adultos
    const childrenAges = build.request.menores ?? []
    const ctx = { nights, hasKids: childrenAges.length > 0, originInterior: !['BUE', 'EZE', 'AEP'].includes(build.request.origen) }

    // 1) Aéreo por fecha.
    const dates = candidateDates(window, departure, { maxDates: MAX_DATES })
    const cellsByDate = new Map<string, FareCell[]>()
    let reused = 0
    for (const date of dates) {
      const r = await flightCellsFor(db, { originTc, destTc, date, nights, adults, childrenAges, jobId: job.id })
      if (r.reused) reused++
      if (r.cells.length > 0) cellsByDate.set(date, r.cells)
      await heartbeat()
    }
    const ranked = rankDates(cellsByDate, profile, ctx)
    if (ranked.length === 0) {
      await fail(db, packageId, trigger, `Ninguna de las ${dates.length} fechas de ${window.label} tiene aéreo ${originTc}→${destTc} de ${nights} noches`, meta)
      await log(`${label}: sin aéreo en ${window.label} (${dates.length} fechas)`, { packageId, dates }, 'warning')
      return { ok: true, result: { packageId, status: 'failed', reason: 'sin aéreo', dates } }
    }

    // 2) Paquete completo en las mejores fechas del aéreo.
    const attempts: Array<{ ranked: RankedDate; run: Awaited<ReturnType<typeof runQuote>>; price: number | null; match: 'matched' | 'missing' | 'unknown' }> = []
    for (const rd of ranked.slice(0, FULL_QUOTES)) {
      const request: QuoteMultiRequest = { ...build.request, fecha_inicio: rd.date, vuelo_directo: profile.direct_required || rd.cell.direct, max_opciones: 3 }
      const run = await runQuote(db, packageId, request, build.instance, job.id)
      await heartbeat()
      const picked = run.response && run.summary?.ok ? pickMatchingOption(run.response, build.expectedHotels) : { option: null, match: 'unknown' as const }
      attempts.push({ ranked: rd, run, price: picked.option?.precio_pp_final ?? run.summary?.pricePp ?? null, match: picked.match })
    }
    const ok = attempts.filter(a => a.run.summary?.ok && a.price !== null)
    if (ok.length === 0) {
      const why = attempts.map(a => `${a.ranked.date}: ${a.run.error ?? a.run.summary?.diagnostico ?? a.run.summary?.status ?? 'sin respuesta'}`).join('; ')
      await fail(db, packageId, trigger, `El aéreo existe pero el paquete completo no cotizó (${why})`, { ...meta, alternatives: ranked.map(r => r.cell) })
      return attempts.some(a => a.run.error) ? { ok: false, error: why, retry: true } : { ok: true, result: { packageId, status: 'failed', reason: why } }
    }
    const rank = (a: typeof ok[number]) => (a.match === 'missing' ? 1 : 0) * 1e6 + (a.price ?? 1e6)
    const best = [...ok].sort((a, b) => rank(a) - rank(b))[0]
    const s = best.run.summary!
    const pricePp = best.price!
    const currentPrice = pkg.row.target_price ?? pkg.row.current_price_per_pax
    const variancePct = currentPrice ? Math.round(((pricePp - currentPrice) / currentPrice) * 10000) / 100 : null
    const notes: string[] = [best.ranked.reason]
    if (best.match === 'missing') notes.push(`El hotel ${build.expectedHotels[0] ?? 'del paquete'} no apareció en esa fecha; la opción más cercana fue ${s.hotelName ?? '?'}`)
    if (best.ranked.date === departure) notes.push('La mejor fecha es la misma salida actual, con aéreo de sistema')
    const others = ok.filter(a => a !== best).map(a => `${a.ranked.date}: USD ${a.price}`)
    if (others.length) notes.push(`También cotizada ${others.join(', ')}`)

    await db.from('requote_alternatives').update({ status: 'superseded' }).eq('package_id', packageId).in('status', ['proposed', 'failed'])
    const { data: inserted } = await db.from('requote_alternatives').insert({
      package_id: packageId, quote_run_id: best.run.runId, trigger, season_kind: window.kind, window_from: window.from, window_to: window.to,
      current_departure: departure, current_price_pp: currentPrice, proposed_departure: s.departureDate ?? best.ranked.date, proposed_return: s.returnDate ?? addDays(best.ranked.date, nights), nights,
      price_pp: pricePp, currency: s.currency || 'USD', variance_pct: variancePct, airline: s.airline ?? best.ranked.cell.airline, flight_numbers: s.flightNumbers.length ? s.flightNumbers : (best.ranked.cell.flightNumbers ?? []), direct: s.direct ?? best.ranked.cell.direct, stops: s.stops,
      hotel_names: build.expectedHotels, hotel_matched: best.match === 'matched', alternatives: ranked.map(r => r.cell), stopover_note: notes.join('. '),
      status: 'proposed', reason: `${window.label}: ${dates.length} fechas sondeadas (${reused} reutilizadas de vuelos.siviajo.com); mejor aéreo ${ranked[0].date} ${ranked[0].cell.airline ?? ''} ${ranked[0].cell.direct ? 'directo' : 'con escala'} USD ${ranked[0].cell.pricePerPax} pp; paquete completo cotizado en ${ok.length} fecha(s)`,
      created_by: `job:${job.id}`,
    }).select('id').single()
    const altId = (inserted as { id: number } | null)?.id ?? null
    await log(`${label}: fecha alternativa ${best.ranked.date} → ${s.returnDate} · ${s.airline ?? '?'} ${s.direct ? 'directo' : 'con escala'} · USD ${pricePp} pp (hoy ${currentPrice}, ${variancePct !== null ? `${variancePct > 0 ? '+' : ''}${variancePct}%` : '?'}) · ${window.label}, ${dates.length} fechas sondeadas`, { packageId, altId, ranked: ranked.map(r => ({ date: r.date, price: r.cell.pricePerPax, direct: r.cell.direct, airline: r.cell.airline })) })
    return { ok: true, result: { packageId, status: 'proposed', altId, proposedDeparture: best.ranked.date, pricePp, currentPrice, variancePct, direct: s.direct, airline: s.airline, hotelMatch: best.match, datesProbed: dates.length, reused, ranked: ranked.slice(0, 5).map(r => ({ date: r.date, price: r.cell.pricePerPax, direct: r.cell.direct, airline: r.cell.airline })) } }
  },
}
