import { quoteMulti, type QuoteMultiResponse } from '@/lib/cotizador/client'
import { getProfile } from '@/lib/producto/profiles'
import { buildQuoteRequest, ideaToDraft, suggestTitle, summarizeQuote, summaryToFareCell, type IdeaRow, type QuoteSummary } from '@/lib/producto/idea-builder'
import { validateIdea } from '@/lib/producto/validate-idea'
import { decideStopover } from '@/lib/producto/stopover-rule'
import { FLAGS } from '../flags'
import type { Db, HandlerDefinition } from '../types'

/**
 * Cotiza una idea con el cotizador-bot (precio real de siviajo.com).
 *
 * 1. Valida contra el perfil: una regla dura deja la idea en needs_review sin cotizar.
 * 2. Cotización A con la fecha elegida (o el mes flexible) y el directo que pida el perfil.
 * 3. Si salió con escala y el destino tiene umbral, cotización B sólo directo en
 *    la misma fecha; la regla directo/escala decide cuál queda.
 * Nunca más de dos cotizaciones por idea.
 */
async function runQuote(db: Db, idea: IdeaRow, request: ReturnType<typeof buildQuoteRequest>, instance: 'emisivo' | 'nacional', jobId: number): Promise<{ runId: number; response: QuoteMultiResponse | null; summary: QuoteSummary | null; error: string | null }> {
  const { data: run } = await db.from('quote_runs').insert({ purpose: 'idea', idea_id: idea.id, instance, request, status: 'pending', job_id: jobId, created_by: `job:${jobId}` }).select('id').single()
  const runId = (run as { id: number }).id
  try {
    const response = await quoteMulti(db, request, { instance, jobId })
    const summary = summarizeQuote(response)
    await db.from('quote_runs').update({
      response,
      status: ['ok', 'sin_disponibilidad', 'parametros_invalidos', 'error_upstream', 'timeout'].includes(response.status) ? response.status : 'error',
      price_pp: summary.pricePp, total_price: summary.totalPrice, currency: summary.currency,
      hotel_name: summary.hotelName, hotel_code: summary.hotelCode, board: summary.board, stars: summary.stars, regimen_confirmed: summary.regimenConfirmed,
      airline: summary.airline, direct: summary.direct, departure_date: summary.departureDate, return_date: summary.returnDate,
      warnings: summary.warnings, elapsed_seconds: summary.elapsedSeconds, completed_at: new Date().toISOString(),
    }).eq('id', runId)
    return { runId, response, summary, error: null }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db.from('quote_runs').update({ status: 'error', warnings: [message], completed_at: new Date().toISOString() }).eq('id', runId)
    return { runId, response: null, summary: null, error: message }
  }
}

export const ideaQuoteHandler: HandlerDefinition = {
  kind: 'idea.quote',
  lane: 'cotizador',
  flags: [FLAGS.cotizadorCalls],
  provider: 'cotizador',
  description: 'Idea: cotización real con el cotizador-bot (hasta dos: con escala y directo) y regla directo/escala',
  handler: async ({ db, job, heartbeat, log }) => {
    const ideaId = Number(job.payload.ideaId)
    if (!ideaId) return { ok: false, error: 'payload.ideaId obligatorio', retry: false }
    const { data } = await db.from('package_ideas').select('*').eq('id', ideaId).maybeSingle()
    if (!data) return { ok: false, error: `Idea ${ideaId} no existe`, retry: false }
    const idea = data as IdeaRow
    const profile = idea.destination_code ? await getProfile(db, idea.destination_code) : null
    if (!profile) {
      await db.from('package_ideas').update({ status: 'needs_review', validation: { ok: false, hard: ['La idea no tiene perfil de destino'], soft: [] }, updated_at: new Date().toISOString() }).eq('id', ideaId)
      return { ok: true, result: { ideaId, status: 'needs_review', reason: 'sin perfil' } }
    }

    const validation = validateIdea(ideaToDraft(idea), profile)
    if (!validation.ok) {
      await db.from('package_ideas').update({ status: 'needs_review', validation, updated_at: new Date().toISOString() }).eq('id', ideaId)
      await log(`Idea #${ideaId} no pasa el perfil: ${validation.hard.join(' · ')}`, { ideaId, validation }, 'warning')
      return { ok: true, result: { ideaId, status: 'needs_review', hard: validation.hard } }
    }

    await db.from('package_ideas').update({ status: 'quoting', validation, updated_at: new Date().toISOString() }).eq('id', ideaId)
    const instance = profile.cotizador_instance
    const directOnly = profile.direct_required || idea.direct_flight === true

    const a = await runQuote(db, idea, buildQuoteRequest(idea, profile, { directOnly }), instance, job.id)
    await heartbeat()
    if (!a.summary || !a.summary.ok) {
      const status = a.summary?.status === 'sin_disponibilidad' ? 'needs_review' : 'failed'
      const error = a.error ?? a.summary?.diagnostico ?? `Cotizador devolvió ${a.summary?.status ?? 'sin respuesta'}`
      await db.from('package_ideas').update({ status, quote_run_id: a.runId, error, updated_at: new Date().toISOString() }).eq('id', ideaId)
      await log(`Idea #${ideaId}: cotización ${status}: ${error}`, { ideaId, runId: a.runId }, 'warning')
      return a.error ? { ok: false, error, retry: true } : { ok: true, result: { ideaId, status, error } }
    }

    // Segunda cotización sólo si vale la pena comparar directo contra escala.
    let chosen = a
    let stopoverNote: string | null = null
    const needsDirectCheck = !directOnly && profile.stopover_threshold_pct !== null && a.summary.direct === false && a.summary.departureDate
    if (needsDirectCheck) {
      const b = await runQuote(db, idea, buildQuoteRequest(idea, profile, { directOnly: true, fixedDate: a.summary.departureDate }), instance, job.id)
      await heartbeat()
      const cellA = summaryToFareCell(a.summary)
      const cellB = b.summary?.ok ? summaryToFareCell(b.summary) : null
      const decision = decideStopover(profile, { nights: idea.nights, hasKids: idea.children > 0, originInterior: !['BUE', 'EZE', 'AEP'].includes((idea.origin || 'BUE').toUpperCase()) }, cellB, cellA)
      stopoverNote = decision.reason
      if (decision.choice === 'direct' && b.summary?.ok) chosen = b
    }

    const s = chosen.summary!
    const soft = [...validation.soft]
    if (!s.regimenConfirmed) soft.push('El sitio no confirmó el régimen de la opción elegida')
    if (s.direct === null) soft.push('No se pudo confirmar si el vuelo es directo')
    if (profile.regimen_required && s.regimen && s.regimen !== profile.regimen_required) soft.push(`El hotel cotizado es ${s.board}; el perfil pide ${profile.regimen_required.replace('_', ' ')}`)
    const status = soft.length > 0 ? 'needs_review' : 'priced'
    // Con fecha fija el cotizador no explica la elección: se conserva el motivo que ya tenía la idea.
    const dateReason = [s.dateReason, stopoverNote].filter(Boolean).join(' · ') || null

    if (s.alternatives.length > 0) {
      await db.from('flight_price_probes').insert(s.alternatives.map(c => ({ origin: idea.origin || 'BUE', destination: profile.iata_airport ?? profile.name, destination_code: profile.code, departure_date: c.date, nights: idea.nights, price_per_pax: c.pricePerPax, currency: c.currency, direct: c.direct, duration_minutes: c.durationMinutes, stops: c.stops ?? null, source: 'cotizador_probe', idea_id: ideaId, job_id: job.id })))
    }

    await db.from('package_ideas').update({
      status,
      quote_run_id: chosen.runId,
      quoted_price_pp: s.pricePp,
      quoted_currency: s.currency,
      quote_summary: { chosen: s, alternativeQuote: chosen === a ? null : a.summary, stopover: stopoverNote, runs: [a.runId, ...(chosen !== a ? [chosen.runId] : [])] },
      chosen_departure_date: s.departureDate,
      return_date: s.returnDate,
      date_choice_reason: dateReason ?? (idea as unknown as { date_choice_reason?: string | null }).date_choice_reason ?? null,
      title_suggested: suggestTitle(profile, idea, s),
      themes: profile.themes_default,
      validation: { ...validation, soft },
      error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', ideaId)

    await log(`Idea #${ideaId} ${status}: USD ${s.pricePp} pp, ${s.hotelName ?? 'sin hotel'} (${s.board ?? '-'}), sale ${s.departureDate}${s.direct ? ' directo' : s.direct === false ? ' con escala' : ''}`, { ideaId, runId: chosen.runId, stopover: stopoverNote, soft })
    return { ok: true, result: { ideaId, status, pricePp: s.pricePp, departureDate: s.departureDate, runId: chosen.runId, quotes: chosen === a ? 1 : 2 } }
  },
}
