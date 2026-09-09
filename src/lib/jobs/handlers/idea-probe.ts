import { getMatrix, isVuelosConfigured, matrixToFareCells } from '@/lib/vuelos/client'
import { getProfile } from '@/lib/producto/profiles'
import { pickDate } from '@/lib/producto/date-picker'
import { enqueueJob } from '../queue'
import { FLAGS } from '../flags'
import { MANUAL_PRIORITY } from '../lanes'
import type { HandlerDefinition } from '../types'
import type { FareCell } from '@/lib/producto/types'

/**
 * Sonda de fechas de una idea con el matrix de vuelos-siviajo (mes completo
 * = dos mapas de ±7 días). Elige la fecha con la regla de precio ajustado
 * por duración y deja la idea lista para cotizar. Si vuelos-siviajo no está
 * configurado, la idea pasa directo al cotizador, que elige la fecha solo.
 */
export const ideaProbeHandler: HandlerDefinition = {
  kind: 'idea.probe',
  lane: 'vuelos',
  flags: [FLAGS.vuelosCalls],
  provider: 'vuelos',
  description: 'Idea: calendario de precios del mes (vuelos-siviajo) y elección de fecha; después encola idea.quote',
  handler: async ({ db, job, heartbeat, log }) => {
    const ideaId = Number(job.payload.ideaId)
    if (!ideaId) return { ok: false, error: 'payload.ideaId obligatorio', retry: false }
    const { data: idea } = await db.from('package_ideas').select('*').eq('id', ideaId).maybeSingle()
    if (!idea) return { ok: false, error: `Idea ${ideaId} no existe`, retry: false }
    const priority = job.priority >= MANUAL_PRIORITY ? MANUAL_PRIORITY : undefined
    const next = async (note: string) => {
      await enqueueJob(db, { kind: 'idea.quote', payload: { ideaId }, priority, dedupeKey: `idea.quote:${ideaId}`, entityType: 'idea', entityId: ideaId, createdBy: `job:${job.id}` })
      await log(note, { ideaId })
    }

    if (!isVuelosConfigured()) {
      await db.from('package_ideas').update({ status: 'quoting', probe_summary: { skipped: 'vuelos-siviajo no configurado: el cotizador elige la fecha' }, probe_job_id: job.id, updated_at: new Date().toISOString() }).eq('id', ideaId)
      await next(`Idea #${ideaId}: sin vuelos-siviajo, pasa directo a cotizar`)
      return { ok: true, result: { ideaId, probed: false } }
    }

    const profile = idea.destination_code ? await getProfile(db, idea.destination_code) : null
    const month = idea.month ?? (idea.departure_date ?? '').slice(0, 7)
    if (!profile || !month || !profile.iata_airport) {
      await db.from('package_ideas').update({ status: 'quoting', probe_summary: { skipped: 'sin perfil, mes o aeropuerto' }, updated_at: new Date().toISOString() }).eq('id', ideaId)
      await next(`Idea #${ideaId}: sin datos para sondear, pasa a cotizar`)
      return { ok: true, result: { ideaId, probed: false } }
    }

    await db.from('package_ideas').update({ status: 'probing', probe_job_id: job.id, updated_at: new Date().toISOString() }).eq('id', ideaId)
    const [y, m] = month.split('-').map(Number)
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
    const origin = idea.origin || 'BUE'
    const cells = new Map<string, FareCell>()
    for (const day of [8, 23]) {
      const baseDate = `${month}-${String(Math.min(day, lastDay)).padStart(2, '0')}`
      const matrix = await getMatrix(db, { origin, destination: profile.iata_airport, baseDate, tripDays: idea.nights }, job.id)
      for (const cell of matrixToFareCells(matrix)) {
        const prev = cells.get(cell.date)
        if (!prev || cell.pricePerPax < prev.pricePerPax) cells.set(cell.date, cell)
      }
      await heartbeat()
    }
    const all = [...cells.values()].sort((a, b) => a.date.localeCompare(b.date))
    const minDate = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const pick = pickDate(all, profile, { nights: idea.nights, hasKids: idea.children > 0, originInterior: !['BUE', 'EZE', 'AEP'].includes(origin.toUpperCase()) }, { from: `${month}-01` > minDate ? `${month}-01` : minDate, to: `${month}-${String(lastDay).padStart(2, '0')}`, maxPricePerPax: idea.budget_max_pp ? Number(idea.budget_max_pp) : undefined })

    if (all.length > 0) {
      await db.from('flight_price_probes').insert(all.map(c => ({ origin, destination: profile.iata_airport, destination_code: profile.code, departure_date: c.date, nights: idea.nights, price_per_pax: c.pricePerPax, currency: c.currency, direct: null, source: 'tc_search', idea_id: ideaId, job_id: job.id })))
    }
    await db.from('package_ideas').update({
      status: 'quoting',
      chosen_departure_date: pick?.chosen.date ?? null,
      date_choice_reason: pick ? `Matrix de vuelos-siviajo: ${pick.reason}` : `El matrix no devolvió fechas con precio para ${month}`,
      probe_summary: { cells: all.length, cheapest: all.length ? Math.min(...all.map(c => c.pricePerPax)) : null, chosen: pick?.chosen ?? null, alternatives: pick?.alternatives ?? [] },
      updated_at: new Date().toISOString(),
    }).eq('id', ideaId)
    await next(`Idea #${ideaId}: ${all.length} fechas sondeadas, elegida ${pick?.chosen.date ?? 'ninguna'}`)
    return { ok: true, result: { ideaId, probed: true, cells: all.length, chosen: pick?.chosen.date ?? null } }
  },
}
