import type { Db } from '@/lib/jobs/types'
import type { ProbeOption } from '@/lib/cotizador/client'

/**
 * Fase 7: pedido de cupos a aéreos. Una "tirada" es una salida candidata
 * (fecha de ida y vuelta, aerolínea, vuelos) con su precio de sistema; se
 * las mandamos a aéreos, ellos contestan precio por plaza, comparamos y
 * confirmamos. Lo puro vive acá; la base y Meta/TC afuera.
 */

export type CupoRequestStatus = 'draft' | 'probing' | 'ready' | 'sent' | 'answered' | 'confirming' | 'confirmed' | 'loaded' | 'closed' | 'cancelled'
export type CupoOptionStatus = 'probed' | 'requested' | 'quoted' | 'accepted' | 'rejected' | 'loaded'

export const REQUEST_STATUS_LABELS: Record<CupoRequestStatus, string> = {
  draft: 'Borrador', probing: 'Sondeando', ready: 'Listo para enviar', sent: 'Enviado a aéreos', answered: 'Respondido', confirming: 'Confirmando', confirmed: 'Confirmado', loaded: 'Cupo cargado', closed: 'Cerrado', cancelled: 'Cancelado',
}
export const OPTION_STATUS_LABELS: Record<CupoOptionStatus, string> = { probed: 'Sondeada', requested: 'Pedida', quoted: 'Cotizada', accepted: 'Aceptada', rejected: 'Rechazada', loaded: 'Cargada' }

export interface CupoRequest {
  id: number; status: CupoRequestStatus; title: string; origin_code: string; origin_name: string | null; destination_code: string; destination_name: string; destination_profile_code: string | null
  months: string[]; weekdays: number[]; nights: number; seats_requested: number; adults: number; children_ages: number[]; airline_pref: string[]; direct_only: boolean; max_options: number; notes: string | null
  requested_by: string | null; probe_job_id: number | null; probe_error: string | null; last_probe_at: string | null
  sent_at: string | null; sent_by: string | null; response_deadline_at: string | null; answered_at: string | null; answered_by: string | null; response_hours: number | null
  confirmed_at: string | null; confirmed_by: string | null; slack_message_ts: string | null; created_at: string; updated_at: string
}

export interface CupoRequestOption {
  id: number; request_id: number; rank: number; status: CupoOptionStatus; departure_date: string; return_date: string; nights: number
  airline: string | null; airline_code: string | null; flight_out: string | null; flight_back: string | null; depart_out: string | null; arrive_out: string | null; depart_back: string | null; arrive_back: string | null
  stops_out: number | null; stops_back: number | null; direct: boolean | null; fare_family: string | null; checked_bag: boolean | null; seats: number
  system_price_pp: number | null; system_currency: string | null; system_probed_at: string | null; market_price_pp: number | null
  airline_price_pp: number | null; airline_currency: string | null; airline_notes: string | null; airline_quoted_at: string | null; delta_pct: number | null
  decision_reason: string | null; decided_by: string | null; decided_at: string | null; flight_id: number | null; return_flight_id: number | null; idea_id: number | null; created_at: string; updated_at: string
}

const iso = (d: Date) => d.toISOString().slice(0, 10)
export const addDays = (s: string, n: number) => iso(new Date(Date.parse(`${s}T00:00:00Z`) + n * 86400000))

/**
 * Fechas de salida a sondear: en cada mes pedido, todos los días de la semana
 * elegidos (0 = domingo … 6 = sábado), a partir de `minLeadDays` desde hoy.
 * Tope de `maxDates` repartido entre los meses para que ninguno quede sin sondas.
 */
export function candidateDepartures(input: { months: string[]; weekdays: number[]; today: string; minLeadDays?: number; maxDates?: number }): string[] {
  const minLead = input.minLeadDays ?? 21
  const maxDates = input.maxDates ?? 24
  const weekdays = new Set(input.weekdays.length ? input.weekdays : [4, 6])
  const floor = addDays(input.today, minLead)
  const perMonth = new Map<string, string[]>()
  for (const month of [...new Set(input.months)].sort()) {
    const [y, m] = month.split('-').map(Number)
    if (!y || !m) continue
    const dates: string[] = []
    for (let day = 1; day <= 31; day++) {
      const d = new Date(Date.UTC(y, m - 1, day))
      if (d.getUTCMonth() !== m - 1) break
      const s = iso(d)
      if (s < floor) continue
      if (weekdays.has(d.getUTCDay())) dates.push(s)
    }
    if (dates.length) perMonth.set(month, dates)
  }
  if (perMonth.size === 0) return []
  const quota = Math.max(1, Math.floor(maxDates / perMonth.size))
  const out: string[] = []
  for (const dates of perMonth.values()) {
    const step = Math.max(1, Math.ceil(dates.length / quota))
    for (let i = 0; i < dates.length && out.length < maxDates; i += step) out.push(dates[i])
  }
  return out.sort()
}

export const optionIsDirect = (o: Pick<ProbeOption, 'stopsOut' | 'stopsBack'>) => o.stopsOut === 0 && (o.stopsBack === 0 || o.stopsBack === null)

/** De las opciones de una sonda, la que conviene pedir: la más barata que cumpla directo (si se pidió) y aerolínea preferida (si hay). */
export function pickOptionForDate(options: ProbeOption[], prefs: { directOnly: boolean; airlinePref: string[] }): ProbeOption | null {
  if (options.length === 0) return null
  const pref = new Set(prefs.airlinePref.map(a => a.trim().toUpperCase()).filter(Boolean))
  const matchesAirline = (o: ProbeOption) => pref.size === 0 || pref.has((o.airline || '').trim().toUpperCase()) || [...pref].some(p => (o.airline || '').toUpperCase().includes(p))
  const tiers: Array<(o: ProbeOption) => boolean> = [
    o => (!prefs.directOnly || optionIsDirect(o)) && matchesAirline(o),
    o => !prefs.directOnly || optionIsDirect(o),
    () => !prefs.directOnly,
  ]
  for (const ok of tiers) {
    const c = options.filter(ok).sort((a, b) => a.pricePp - b.pricePp)
    if (c.length) return c[0]
  }
  return null
}

/** Orden de las tiradas: más barata primero; a igual precio, directa antes que con escala. */
export function rankOptions<T extends { system_price_pp: number | null; direct: boolean | null; departure_date: string }>(options: T[]): T[] {
  return [...options].sort((a, b) => {
    const pa = a.system_price_pp ?? Number.POSITIVE_INFINITY, pb = b.system_price_pp ?? Number.POSITIVE_INFINITY
    if (pa !== pb) return pa - pb
    if ((a.direct ? 1 : 0) !== (b.direct ? 1 : 0)) return a.direct ? -1 : 1
    return a.departure_date.localeCompare(b.departure_date)
  })
}

/** Horas de espera de aéreos (desde el envío hasta la respuesta, o hasta ahora). */
export function waitingHours(req: Pick<CupoRequest, 'sent_at' | 'answered_at'>, now: Date = new Date()): number | null {
  if (!req.sent_at) return null
  const end = req.answered_at ? Date.parse(req.answered_at) : now.getTime()
  return Math.round(((end - Date.parse(req.sent_at)) / 3600000) * 10) / 10
}

export async function loadRequest(db: Db, id: number): Promise<{ request: CupoRequest; options: CupoRequestOption[] } | null> {
  const { data: request } = await db.from('cupo_requests').select('*').eq('id', id).maybeSingle()
  if (!request) return null
  const { data: options } = await db.from('cupo_request_options').select('*').eq('request_id', id).order('rank').order('departure_date')
  return { request: request as unknown as CupoRequest, options: ((options ?? []) as unknown as CupoRequestOption[]).map(o => ({ ...o, system_price_pp: o.system_price_pp === null ? null : Number(o.system_price_pp), airline_price_pp: o.airline_price_pp === null ? null : Number(o.airline_price_pp), delta_pct: o.delta_pct === null ? null : Number(o.delta_pct) })) }
}
