import { probeFlights, type ProbeOption } from '@/lib/cotizador/client'
import { candidateDepartures, addDays, loadRequest, optionIsDirect, pickOptionForDate, rankOptions } from '@/lib/cupos/requests'
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
  const result = await probeFlights(db, { originCode: args.originTc, destCode: args.destTc, departDate: args.date, returnDate, adults: args.adults, childrenAges: args.childrenAges, topN: 6 }, { jobId: args.jobId })
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
 * elige por fecha la opción que conviene pedir y guarda las mejores N con su
 * precio de sistema. Lane cotizador: de noche salvo disparo manual.
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
    const dates = candidateDepartures({ months: request.months, weekdays: request.weekdays, today, maxDates: 24 })
    if (dates.length === 0) {
      await db.from('cupo_requests').update({ status: 'draft', probe_error: 'Ningún mes pedido tiene fechas a más de 21 días' }).eq('id', requestId)
      return { ok: true, result: { requestId, dates: 0 } }
    }
    await log(`Pedido #${requestId} ${request.origin_code}→${request.destination_code}: ${dates.length} fechas a sondear (${request.nights} noches, ${request.adults} adultos)`, { dates })

    const found: Array<{ date: string; option: ProbeOption; allOptions: ProbeOption[] }> = []
    const errors: string[] = []
    let reused = 0
    for (const date of dates) {
      await heartbeat?.()
      try {
        const r = await probeDate(db, { requestId, originTc: request.origin_code, destTc: request.destination_code, date, nights: request.nights, adults: request.adults, childrenAges: request.children_ages, jobId: job.id })
        if (r.reused) reused++
        if (r.error) errors.push(`${date}: ${r.error}`)
        const pick = pickOptionForDate(r.options, { directOnly: request.direct_only, airlinePref: request.airline_pref })
        if (pick) found.push({ date, option: pick, allOptions: r.options })
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        errors.push(`${date}: ${message}`)
        if (/presupuesto|budget/i.test(message)) break
      }
      await new Promise(r => setTimeout(r, 1500))
    }

    const rows = found.map(f => ({
      request_id: requestId, departure_date: f.date, return_date: addDays(f.date, request.nights), nights: request.nights, airline: f.option.airline || null, airline_code: (f.option.flightOut || '').replace(/[^A-Za-z].*$/, '').toUpperCase() || null,
      flight_out: f.option.flightOut || null, flight_back: f.option.flightBack || null, depart_out: f.option.departOut || null, arrive_out: f.option.arriveOut || null, depart_back: f.option.departBack || null, arrive_back: f.option.arriveBack || null,
      stops_out: f.option.stopsOut, stops_back: f.option.stopsBack, direct: optionIsDirect(f.option), fare_family: f.option.fareFamily || null, checked_bag: f.option.checkedBag, seats: request.seats_requested,
      system_price_pp: f.option.pricePp, system_currency: f.option.currency || 'USD', system_probed_at: new Date().toISOString(), probe_options: f.allOptions.slice(0, 6), status: 'probed', updated_at: new Date().toISOString(),
    }))
    const ranked = rankOptions(rows).slice(0, Math.max(request.max_options, 3))
    // Sólo se tocan las tiradas sondeadas: las que aéreos ya cotizó o alguien decidió quedan como están.
    await db.from('cupo_request_options').delete().eq('request_id', requestId).eq('status', 'probed')
    const { data: kept } = await db.from('cupo_request_options').select('departure_date, airline_code, flight_out').eq('request_id', requestId)
    const keptKeys = new Set((kept ?? []).map(k => `${k.departure_date}|${k.airline_code}|${k.flight_out}`))
    const fresh = ranked.filter(r => !keptKeys.has(`${r.departure_date}|${r.airline_code}|${r.flight_out}`)).map((r, i) => ({ ...r, rank: i + 1 }))
    if (fresh.length) {
      const { error } = await db.from('cupo_request_options').insert(fresh)
      if (error) { await db.from('cupo_requests').update({ status: 'draft', probe_error: error.message }).eq('id', requestId); return { ok: false, error: error.message, retry: false } }
    }
    const status = fresh.length + keptKeys.size > 0 ? 'ready' : 'draft'
    await db.from('cupo_requests').update({ status: request.status === 'ready' && status === 'draft' ? 'ready' : status, last_probe_at: new Date().toISOString(), probe_error: found.length === 0 ? `Sin opciones en ${dates.length} fechas${errors.length ? `: ${errors.slice(0, 3).join('; ')}` : ''}` : (errors.length ? `${errors.length} fecha(s) sin respuesta` : null) }).eq('id', requestId)
    await log(`Pedido #${requestId}: ${found.length} fechas con opción, ${fresh.length} tiradas guardadas (${reused} sondas reutilizadas, ${errors.length} errores)`, { errors: errors.slice(0, 10), best: ranked.slice(0, 5).map(r => `${r.departure_date} ${r.airline} ${r.system_price_pp}`) })
    return { ok: true, result: { requestId, dates: dates.length, found: found.length, saved: fresh.length, reused, errors: errors.length } }
  },
}
