import { getAnthropicClient } from '@/lib/anthropic/client'
import type { CupoRequest, CupoRequestOption } from './requests'

/**
 * Lee la respuesta de un aéreo (mail pegado hoy; casilla mañana) y la lleva a
 * datos: precio por plaza por salida, lugares ofrecidos, depósito, vencimientos,
 * release, lista de nombres, cancelación. Lo que el mail no dice queda null:
 * nunca se inventa. Lo extraído se muestra como propuesta y una persona aplica.
 */

export interface ParsedTerms {
  deposit_pct: number | null
  deposit_amount_pp: number | null
  deposit_due_date: string | null
  balance_due_date: string | null
  release_date: string | null
  name_list_due_date: string | null
  valid_until: string | null
  cancellation_terms: string | null
  payment_conditions: string | null
}

export interface ParsedOption {
  departure_date: string | null
  airline: string | null
  flight_out: string | null
  price_pp: number | null
  currency: string | null
  seats_offered: number | null
  available: boolean | null
  notes: string | null
  terms: Partial<ParsedTerms> | null
}

export interface ParsedReply {
  options: ParsedOption[]
  terms: ParsedTerms
  general_notes: string | null
  confidence: 'alta' | 'media' | 'baja'
}

export const EMPTY_TERMS: ParsedTerms = { deposit_pct: null, deposit_amount_pp: null, deposit_due_date: null, balance_due_date: null, release_date: null, name_list_due_date: null, valid_until: null, cancellation_terms: null, payment_conditions: null }

const MODEL = 'claude-sonnet-5'

export function buildReplyPrompt(request: CupoRequest, options: CupoRequestOption[], text: string, today: string): { system: string; user: string } {
  const system = [
    'Sos el asistente de cupos de una agencia de viajes argentina. Leés la respuesta de una aerolínea o consolidador a un pedido de cupos y la pasás a JSON.',
    'Reglas duras:',
    '- Sólo datos que estén en el texto. Si un dato no aparece, va null. Nunca inventes precios, fechas ni condiciones.',
    '- Precio: por persona, ida y vuelta, en la moneda indicada (USD si dice dólares o U$S; ARS si dice pesos). Si el precio es por tramo o neto más impuestos, sumalo y aclaralo en notes.',
    `- Fechas en formato YYYY-MM-DD. "A 30 días de la salida" se convierte usando la fecha de salida de esa tirada. "A 7 días" o "7 días" sin referencia = desde hoy (${today}).`,
    '- Cada opción de la respuesta se asocia a una tirada pedida por fecha de salida (y aerolínea si hay varias ese día). Si la aerolínea ofrece otra fecha que no pedimos, incluila igual con su fecha.',
    '- available: false si dice que no hay cupo / no disponible para esa fecha.',
    '- terms generales = aplican a todas las salidas; terms dentro de una opción = sólo a esa. Si una condición depende de la fecha de salida ("saldo 30 días antes de la salida", "lista de nombres 15 días antes"), calculá la fecha para CADA opción y ponela en los terms de esa opción.',
    '- deposit_pct es porcentaje (30 = 30 %); deposit_amount_pp es importe por persona.',
    'Respondé SOLO con un objeto JSON válido en una sola línea (sin comentarios, sin texto antes ni después, sin comas finales, sin saltos de línea dentro de los textos) con exactamente estas claves:',
    '{"options":[{"departure_date":"2027-03-13","airline":"Arajet","flight_out":"DM701","price_pp":790,"currency":"USD","seats_offered":10,"available":true,"notes":"698 + 92 de tax","terms":null}],"terms":{"deposit_pct":30,"deposit_amount_pp":null,"deposit_due_date":"2027-01-10","balance_due_date":null,"release_date":null,"name_list_due_date":null,"valid_until":null,"cancellation_terms":null,"payment_conditions":null},"general_notes":"","confidence":"alta"}',
    '"terms" dentro de una opción es un objeto con las mismas claves que el "terms" general, o null.',
  ].join('\n')
  const user = [
    `== PEDIDO #${request.id} ==`,
    `${request.origin_code} → ${request.destination_name}, ${request.nights} noches, ${request.seats_requested} lugares pedidos, ${request.adults} adultos por reserva.`,
    '== TIRADAS PEDIDAS ==',
    ...options.map(o => `- ${o.departure_date} → ${o.return_date} · ${o.airline ?? '?'} ${[o.flight_out, o.flight_back].filter(Boolean).join('/')} · precio de sistema USD ${o.system_price_pp ?? '?'}`),
    '== RESPUESTA DEL AÉREO ==',
    text.trim().slice(0, 12000),
  ].join('\n')
  return { system, user }
}

/**
 * Arregla lo que los modelos suelen meter en un JSON: saltos de línea o tabs
 * crudos dentro de un string, comillas tipográficas, comas finales. Puro.
 */
export function repairJson(text: string): string {
  let out = ''
  let inStr = false
  let escaped = false
  for (const ch of text.replace(/[“”]/g, '"').replace(/[‘’]/g, "'")) {
    if (inStr) {
      if (escaped) { out += ch; escaped = false; continue }
      if (ch === '\\') { out += ch; escaped = true; continue }
      if (ch === '"') { inStr = false; out += ch; continue }
      if (ch === '\n') { out += '\\n'; continue }
      if (ch === '\r') continue
      if (ch === '\t') { out += '\\t'; continue }
      out += ch
    } else {
      if (ch === '"') inStr = true
      out += ch
    }
  }
  return out.replace(/,\s*([}\]])/g, '$1')
}

export function parseReplyJson(raw: string): ParsedReply {
  let t = raw.trim()
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) t = fence[1].trim()
  const s = t.indexOf('{'); const e = t.lastIndexOf('}')
  if (s < 0 || e < 0) throw new Error('El modelo no devolvió JSON')
  const j = JSON.parse(repairJson(t.slice(s, e + 1))) as Partial<ParsedReply>
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/[^\d.-]/g, ''))) ? Number(v.replace(/[^\d.-]/g, '')) : null)
  const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const terms = (x: unknown): ParsedTerms => { const o = (x ?? {}) as Record<string, unknown>; return { deposit_pct: num(o.deposit_pct), deposit_amount_pp: num(o.deposit_amount_pp), deposit_due_date: date(o.deposit_due_date), balance_due_date: date(o.balance_due_date), release_date: date(o.release_date), name_list_due_date: date(o.name_list_due_date), valid_until: date(o.valid_until), cancellation_terms: str(o.cancellation_terms), payment_conditions: str(o.payment_conditions) } }
  return {
    options: ((Array.isArray(j.options) ? j.options : []) as unknown[]).map(raw => { const o = (raw ?? {}) as Record<string, unknown>; return ({ departure_date: date(o.departure_date), airline: str(o.airline), flight_out: str(o.flight_out), price_pp: num(o.price_pp), currency: str(o.currency)?.toUpperCase() ?? null, seats_offered: num(o.seats_offered), available: typeof o.available === 'boolean' ? o.available : null, notes: str(o.notes), terms: o.terms ? terms(o.terms) : null }) }),
    terms: terms(j.terms), general_notes: str(j.general_notes), confidence: j.confidence === 'alta' || j.confidence === 'media' || j.confidence === 'baja' ? j.confidence : 'media',
  }
}

export interface ReplyProposal {
  optionId: number | null
  departure_date: string | null
  airline: string | null
  matched: boolean
  price_pp: number | null
  currency: string | null
  seats_offered: number | null
  available: boolean | null
  notes: string | null
  terms: ParsedTerms
  delta_pct: number | null
}

const norm = (s: string | null | undefined) => (s ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')

/** Asocia cada opción leída con una tirada pedida: por fecha de salida y, si hay varias ese día, por aerolínea. Puro. */
export function matchReplyToOptions(parsed: ParsedReply, options: CupoRequestOption[]): ReplyProposal[] {
  return parsed.options.map(p => {
    const sameDay = options.filter(o => o.departure_date === p.departure_date)
    const byAirline = sameDay.filter(o => norm(o.airline) && norm(p.airline) && (norm(o.airline).includes(norm(p.airline)) || norm(p.airline).includes(norm(o.airline))))
    const match = byAirline[0] ?? (sameDay.length === 1 ? sameDay[0] : null)
    const terms: ParsedTerms = { ...parsed.terms, ...Object.fromEntries(Object.entries(p.terms ?? {}).filter(([, v]) => v !== null && v !== undefined)) } as ParsedTerms
    const sys = match?.system_price_pp ?? null
    const delta = sys && p.price_pp !== null && p.available !== false ? Math.round(((p.price_pp - sys) / sys) * 1000) / 10 : null
    return { optionId: match?.id ?? null, departure_date: p.departure_date, airline: p.airline ?? match?.airline ?? null, matched: Boolean(match), price_pp: p.price_pp, currency: p.currency ?? 'USD', seats_offered: p.seats_offered, available: p.available, notes: p.notes, terms, delta_pct: delta }
  })
}

export async function extractReply(request: CupoRequest, options: CupoRequestOption[], text: string): Promise<{ parsed: ParsedReply; model: string }> {
  const { system, user } = buildReplyPrompt(request, options, text, new Date().toISOString().slice(0, 10))
  const client = getAnthropicClient()
  const ask = async (extra?: string) => {
    const msg = await client.messages.create({ model: MODEL, max_tokens: 2500, system, messages: [{ role: 'user', content: extra ? `${user}\n\n${extra}` : user }] })
    return msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
  }
  const raw = await ask()
  try { return { parsed: parseReplyJson(raw), model: MODEL } }
  catch (err) {
    // Un reintento pidiendo sólo el JSON; si vuelve a fallar, el error muestra el principio de lo que devolvió.
    const retry = await ask(`Tu respuesta anterior no fue JSON válido (${err instanceof Error ? err.message : 'error'}). Devolvé únicamente el objeto JSON, sin comentarios ni texto.`)
    try { return { parsed: parseReplyJson(retry), model: MODEL } } catch (err2) { throw new Error(`${err2 instanceof Error ? err2.message : 'JSON inválido'} · respuesta: ${retry.slice(0, 200)}`) }
  }
}
