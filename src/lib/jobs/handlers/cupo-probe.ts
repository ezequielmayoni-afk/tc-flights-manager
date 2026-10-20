import { probeFlights, type ProbeOption } from '@/lib/cotizador/client'
import { addDays, candidateDepartures, groupsFor, loadRequest, optionIsDirect, probeGroupLabel } from '@/lib/cupos/requests'
import { buildTiradas, storeAnalysis, type DateWithMarket } from '@/lib/cupos/tiradas'
import { intelSummary, loadRouteIntel, marketFor } from '@/lib/cupos/route-intel'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'

const PROBE_REUSE_DAYS = 7

/** Sonda por fecha, reutilizando las de la última semana (misma ruta, noches y pasajeros). */
async function probeDate(db: Db, args: { requestId: number; originTc: string; destTc: string; date: string; nights: number; adults: number; childrenAges: number[]; jobId: number }): Promise<{ options: ProbeOption[]; reused: boolean; error: string | null }> {
  const returnDate = addDays(args.date, args.nights)
  const since = new Date(Date.now() - PROBE_REUSE_DAYS * 86400000).toISOString()
  // Sólo se reutilizan sondas del cotizador: las búsquedas de la web (tc_search) no traen opciones completas.
  const { data: existing } = await db.from('flight_price_probes').select('options').eq('source', 'cotizador_probe').eq('origin', args.originTc).eq('destination', args.destTc).eq('departure_date', args.date).eq('nights', args.nights).eq('adults', args.adults).eq('status', 'ok').gte('probed_at', since).not('options', 'is', null).order('probed_at', { ascending: false }).limit(1)
  const cached = (existing?.[0]?.options as ProbeOption[] | null) ?? null
  if (cached && cached.length) return { options: cached, reused: true, error: null }
  const result = await probeFlights(db, { originCode: args.originTc, destCode: args.destTc, departDate: args.date, returnDate, adults: args.adults, childrenAges: args.childrenAges, topN: 10 }, { jobId: args.jobId })
  const now = new Date().toISOString()
  const base = { origin: args.originTc, destination: args.destTc, destination_code: args.destTc, departure_date: args.date, return_date: returnDate, nights: args.nights, adults: args.adults, source: 'cotizador_probe', job_id: args.jobId, cupo_request_id: args.requestId, probed_at: now, expires_at: new Date(Date.now() + 24 * 3600000).toISOString(), elapsed_ms: result.elapsedMs }
  if (result.status !== 'ok' || result.options.length === 0) {
    await db.from('flight_price_probes').insert({ ...base, status: result.status === 'ok' ? 'empty' : result.status, currency: 'USD', error: result.status === 'error' ? result.error : null })
    return { options: [], reused: false, error: result.status === 'error' ? result.error : result.status === 'timeout' ? 'timeout' : null }
  }
  const best = result.options[0]
  await db.from('flight_price_probes').insert({ ...base, status: 'ok', price_per_pax: best.pricePp, currency: best.currency || 'USD', airline: best.airline || null, flight_numbers: [best.flightOut, best.flightBack].filter(Boolean), direct: optionIsDirect(best), stops: best.stopsOut, stops_back: best.stopsBack, duration_minutes: best.durationOutMin, duration_back_minutes: best.durationBackMin, fare_family: best.fareFamily || null, checked_bag: best.checkedBag, carry_on: best.carryOn, options: result.options })
  return { options: result.options, reused: false, error: null }
}

/**
 * Arma las tiradas de un pedido de cupos: sondea el aéreo de sistema fecha
 * por fecha (jueves y sábados de cada mes pedido, o los días elegidos),
 * elige por fecha la opción que conviene pedir y guarda las tiradas con su
 * precio de sistema. Un pedido puede tener varios sondeos (meses, noches,
 * cantidad de fechas, aerolínea y directo propios). Lane cotizador: de noche salvo disparo manual.
 */
export const cupoProbeHandler: HandlerDefinition = {
  kind: 'cupo.probe',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls],
  provider: 'cotizador',
  description: 'Pedido de cupos: sondea fechas con el cotizador y arma las tiradas con precio de sistema',
  handler: async ({ db, job, heartbeat, log }) => {
    const requestId = Number(job.payload.requestId)
    if (!requestId) return { ok: false, error: 'payload.requestId obligatorio', retry: false }
    const loaded = await loadRequest(db, requestId)
    if (!loaded) return { ok: false, error: `Pedido ${requestId} no existe`, retry: false }
    const { request } = loaded
    if (!['draft', 'probing', 'ready'].includes(request.status)) return { ok: true, result: { requestId, skipped: `estado ${request.status}` } }
    await db.from('cupo_requests').update({ status: 'probing', probe_job_id: job.id, probe_error: null }).eq('id', requestId)

    const today = new Date().toISOString().slice(0, 10)
    const { groups, legacy } = groupsFor(request)
    const plan = groups.map((g, gi) => ({ g, gi, label: probeGroupLabel(g), dates: candidateDepartures({ months: g.months, weekdays: g.weekdays, today, maxDates: g.count }) }))
    const totalDates = plan.reduce((n, x) => n + x.dates.length, 0)
    if (totalDates === 0) {
      await db.from('cupo_requests').update({ status: 'draft', probe_error: 'Ningún sondeo tiene fechas a más de 21 días' }).eq('id', requestId)
      return { ok: true, result: { requestId, dates: 0 } }
    }
    await log(`Pedido #${requestId} ${request.origin_code}→${request.destination_code}: ${plan.length} sondeo(s), ${totalDates} fechas (${request.adults} adultos)`, { plan: plan.map(x => ({ label: x.label, dates: x.dates })) })

    // Lo que ya sabemos de la ruta (sondas, Sabre, búsquedas web, cotizaciones del bot): historial por aerolínea, mercado y demanda.
    const intel = await loadRouteIntel(db, { originCode: request.origin_code, destinationCode: request.destination_code, profileCode: request.destination_profile_code, months: [...new Set(groups.flatMap(g => g.months))], nights: [...new Set(groups.map(g => g.nights))] }).catch(async e => { await log(`Sin historial de la ruta: ${e instanceof Error ? e.message : e}`); return null })
    if (intel) await log(`Historial de la ruta (${intel.keys.join('/')}): ${intel.observations} observaciones, ${intel.history.length} aerolíneas, ${intel.demand.botQuotes} cotizaciones del bot y ${intel.demand.webSearches} búsquedas web`)

    const probed: DateWithMarket[] = []
    const errors: string[] = []
    let reused = 0
    let stop = false
    for (const { g, gi, label, dates } of plan) {
      if (stop) break
      for (const date of dates) {
        await heartbeat?.()
        try {
          const r = await probeDate(db, { requestId, originTc: request.origin_code, destTc: request.destination_code, date, nights: g.nights, adults: request.adults, childrenAges: request.children_ages, jobId: job.id })
          if (r.reused) reused++
          if (r.error) errors.push(`${date} (${g.nights} n): ${r.error}`)
          if (r.options.length) probed.push({ date, nights: g.nights, group: gi, groupLabel: label, seats: g.seats ?? request.seats_requested, directOnly: g.directOnly, airlinePref: g.airlinePref, options: r.options, market: intel ? marketFor(intel, date, g.nights) : null })
          if (!r.reused) await new Promise(res => setTimeout(res, 1500))
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          errors.push(`${date} (${g.nights} n): ${message}`)
          if (/presupuesto|budget/i.test(message)) { stop = true; break }
        }
      }
    }

    const singleAirline = request.single_airline !== false
    const prefs = [...new Set(groups.flatMap(g => g.airlinePref))]
    const history = new Map((intel?.history ?? []).map(h => [h.code, h]))
    const { rows: ranked, decision } = buildTiradas({ requestId, legacy, maxOptions: request.max_options, singleAirline, dates: probed, prefs, history })
    const analysis = storeAnalysis(probed, decision, singleAirline, intel ? intelSummary(intel) : null)
    const found = probed
    if (decision?.chosen) await log(`Aerolínea: ${decision.reason}`, { stats: decision.stats.slice(0, 6) })
    void optionIsDirect
    // Sólo se tocan las tiradas sondeadas: las que aéreos ya cotizó o alguien decidió quedan como están.
    await db.from('cupo_request_options').delete().eq('request_id', requestId).eq('status', 'probed')
    const { data: kept } = await db.from('cupo_request_options').select('departure_date, nights, airline_code, flight_out').eq('request_id', requestId)
    const keptKeys = new Set((kept ?? []).map(k => `${k.departure_date}|${k.nights}|${k.airline_code}|${k.flight_out}`))
    const fresh = ranked.filter(r => {
      const key = `${r.departure_date}|${r.nights}|${r.airline_code}|${r.flight_out}`
      if (keptKeys.has(key)) return false
      keptKeys.add(key) // dos sondeos iguales en el mismo mes no duplican la tirada
      return true
    }).map((r, i) => ({ ...r, rank: i + 1 }))
    if (fresh.length) {
      const { error } = await db.from('cupo_request_options').insert(fresh)
      if (error) { await db.from('cupo_requests').update({ status: 'draft', probe_error: error.message }).eq('id', requestId); return { ok: false, error: error.message, retry: false } }
    }
    const status = fresh.length + keptKeys.size > 0 ? 'ready' : 'draft'
    await db.from('cupo_requests').update({ airline_analysis: analysis, status: request.status === 'ready' && status === 'draft' ? 'ready' : status, last_probe_at: new Date().toISOString(), probe_error: found.length === 0 ? `Sin opciones en ${totalDates} fechas${errors.length ? `: ${errors.slice(0, 3).join('; ')}` : ''}` : (errors.length ? `${errors.length} fecha(s) sin respuesta` : decision?.chosen && singleAirline && ranked.length < found.length ? `${decision.chosenName} no tiene opción en ${found.length - ranked.length} fecha(s)` : null) }).eq('id', requestId)
    await log(`Pedido #${requestId}: ${found.length} fechas con opción, ${fresh.length} tiradas guardadas (${reused} sondas reutilizadas, ${errors.length} errores)`, { errors: errors.slice(0, 10), best: ranked.slice(0, 5).map(r => `${r.departure_date} ${r.airline} ${r.system_price_pp}`) })
    return { ok: true, result: { requestId, groups: plan.length, dates: totalDates, airline: decision?.chosen ?? null, found: found.length, saved: fresh.length, reused, errors: errors.length } }
  },
}
