import type { Db } from '@/lib/jobs/types'
import { withCrm } from './pool'

/**
 * Cotizaciones del bot del CRM → observaciones de precio de aéreos.
 *
 * Cada llamada del bot al cotizador queda en `bot_tool_logs` (CRM) con la
 * respuesta completa. En `fechas.alternativas[]` vienen las fechas que sondeó
 * con el precio del aéreo por persona (`pp`), la tarifa, escalas y duración; la
 * fecha elegida además trae aerolínea, números de vuelo, horarios y equipaje en
 * `vuelo`. Se guardan en `flight_price_probes` con `source = 'crm_quote'`, sin
 * `route_id` (no se publican en vuelos.siviajo.com) y sin datos personales.
 */

export const CRM_QUOTE_TOOLS = ['cotizador', 'cotizador_nacional']
const CURSOR = 'crm_flight_quotes'

export interface CrmToolLog { id: string; tool_slug: string; input: Record<string, unknown> | null; output: Record<string, unknown> | null; created_at: string | Date }

export interface FlightObservation {
  origin: string; destination: string; destination_code: string; departure_date: string; return_date: string; nights: number
  price_per_pax: number; currency: string; airline: string | null; airline_code: string | null; flight_numbers: string[] | null
  departure_time: string | null; arrival_time: string | null; stops: number | null; stops_back: number | null; direct: boolean | null
  duration_minutes: number | null; fare_family: string | null; checked_bag: boolean | null; carry_on: boolean | null; adults: number
  source: 'crm_quote'; status: 'ok'; probed_at: string; expires_at: string; raw: Record<string, unknown>
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const num = (v: unknown): number | null => { const n = typeof v === 'string' ? Number(v) : (v as number); return typeof n === 'number' && Number.isFinite(n) ? n : null }
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null)
const nightsBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000)
/** "5h2m" / "11h45m" → minutos. */
export const parseDuration = (v: unknown): number | null => { const m = /^(\d+)h(?:(\d+)m)?$/.exec(String(v ?? '').trim()); return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : null }
/** "AEP→REC" → ['AEP', 'REC']. */
const route = (v: unknown): [string, string] | null => { const m = /^([A-Z]{3})\s*→\s*([A-Z]{3})$/.exec(String(v ?? '').trim()); return m ? [m[1], m[2]] : null }
/** "JA 3826" → { code: 'JA', number: 'JA3826' }. */
const flightNo = (v: unknown): { code: string; number: string } | null => { const m = /^([A-Z0-9]{2})\s*(\d{1,4})$/.exec(String(v ?? '').trim().toUpperCase()); return m ? { code: m[1], number: `${m[1]}${m[2]}` } : null }

function parseJsonField(v: unknown): unknown { if (typeof v !== 'string') return v; try { return JSON.parse(v) } catch { return null } }

/** Una llamada del bot → observaciones (una por fecha sondeada con precio). Puro. */
export function observationsFromToolLog(log: CrmToolLog): FlightObservation[] {
  const input = obj(log.input) ?? {}
  const out = obj(log.output)
  if (!out) return []
  if (out.multidestino) return [] // un precio por tramo armado, no sirve como par ida/vuelta
  const tramos = parseJsonField(input.tramos_json)
  if (Array.isArray(tramos) && tramos.length > 1) return []
  const vuelo = obj(out.vuelo)
  const ida = obj(vuelo?.ida)
  const vta = obj(vuelo?.vuelta)
  const r = route(ida?.ruta_iata)
  const fechas = obj(out.fechas)
  const alternativas = Array.isArray(fechas?.alternativas) ? (fechas!.alternativas as unknown[]) : []
  if (!r || alternativas.length === 0) return []
  // Destino = aeropuerto pedido (tramos[0].iata_aeropuerto); el elegido puede aterrizar en otro (Bayahibe → SDQ).
  const requested = Array.isArray(tramos) ? str(obj(tramos[0])?.iata_aeropuerto)?.toUpperCase() ?? null : null
  const arrival = requested && /^[A-Z]{3}$/.test(requested) ? requested : r[1]
  const origin = (str(input.origen) ?? 'BUE').toUpperCase()
  const viaje = obj(out.viaje)
  const pax = obj(viaje?.pasajeros)
  const adults = Math.max(1, num(pax?.adultos) ?? num(input.adultos) ?? 1)
  const minors = Array.isArray(pax?.menores) ? (pax!.menores as unknown[]).length : 0
  const chosenDate = str(fechas?.elegida) ?? str(viaje?.fecha_ida)
  const nIda = flightNo(vuelo?.numero_vuelo_ida)
  const nVta = flightNo(vuelo?.numero_vuelo_vuelta)
  const equipaje = obj(vuelo?.equipaje)
  const createdAt = new Date(log.created_at).toISOString()
  const destName = str(viaje?.destino) ?? (Array.isArray(tramos) ? str(obj(tramos[0])?.destino) : null)

  const outList: FlightObservation[] = []
  alternativas.forEach((a, idx) => {
    const alt = obj(a)
    const dep = str(alt?.fecha); const ret = str(alt?.fecha_vuelta); const pp = num(alt?.pp)
    if (!dep || !ret || !ISO.test(dep) || !ISO.test(ret) || !pp || pp < 50) return
    const chosen = dep === chosenDate
    const stops = num(alt?.escalas)
    outList.push({
      origin, destination: arrival, destination_code: arrival, departure_date: dep, return_date: ret, nights: nightsBetween(dep, ret),
      price_per_pax: pp, currency: str(out.moneda) ?? 'USD',
      airline: chosen ? str(vuelo?.aerolinea) : null, airline_code: chosen ? nIda?.code ?? null : null,
      flight_numbers: chosen ? [nIda?.number, nVta?.number].filter((x): x is string => Boolean(x)) : null,
      departure_time: chosen ? str(ida?.salida) : null, arrival_time: chosen ? str(ida?.llegada) : null,
      stops, stops_back: chosen ? num(vta?.escalas) : null, direct: stops === null ? null : stops === 0 && (!chosen || (num(vta?.escalas) ?? 0) === 0),
      duration_minutes: parseDuration(alt?.duracion), fare_family: str(alt?.tarifa), checked_bag: typeof alt?.valija_facturada === 'boolean' ? (alt.valija_facturada as boolean) : null,
      carry_on: chosen && typeof equipaje?.carry_on === 'boolean' ? (equipaje.carry_on as boolean) : null, adults,
      source: 'crm_quote', status: 'ok', probed_at: createdAt, expires_at: new Date(Date.parse(createdAt) + 24 * 3600000).toISOString(),
      raw: { crm_log_id: log.id, tool: log.tool_slug, alt_index: idx, chosen, destino: destName, menores: minors, airport_out: r[0], arrival_airport: chosen ? r[1] : undefined, mixed_airlines: chosen ? Boolean(vuelo?.aerolineas_distintas) : undefined },
    })
  })
  // El mismo par de fechas puede venir dos veces (otra tarifa): queda la más barata, prefiriendo la elegida.
  const byPair = new Map<string, FlightObservation>()
  for (const o of outList) {
    const k = `${o.departure_date}|${o.return_date}`
    const cur = byPair.get(k)
    if (!cur || (o.raw.chosen && !cur.raw.chosen) || (o.raw.chosen === cur.raw.chosen && o.price_per_pax < cur.price_per_pax)) byPair.set(k, o)
  }
  return [...byPair.values()]
}

/**
 * Trae del CRM las cotizaciones nuevas desde el cursor y las guarda. Sólo
 * lectura en el CRM (tenant + rango + tools); de a `pageSize`, hasta `maxPages`.
 */
export async function ingestCrmFlightQuotes(db: Db, opts: { backfillDays?: number; pageSize?: number; maxPages?: number; log?: (m: string) => void } = {}): Promise<{ from: string; to: string; logs: number; observations: number; inserted: number; skipped: number }> {
  const pageSize = opts.pageSize ?? 400
  const maxPages = opts.maxPages ?? 25
  const { data: cur } = await db.from('ingest_cursors').select('cursor_at').eq('name', CURSOR).maybeSingle()
  let since = cur?.cursor_at ? new Date(cur.cursor_at as string) : new Date(Date.now() - (opts.backfillDays ?? 60) * 86400000)
  const from = since.toISOString()
  const until = new Date()
  let logs = 0, observations = 0, inserted = 0, skipped = 0
  for (let page = 0; page < maxPages; page++) {
    const rows = await withCrm(async (c, tenant) => (await c.query<CrmToolLog>(
      `SELECT id, tool_slug, input, output, created_at FROM bot_tool_logs
        WHERE tenant_id = $1 AND tool_slug = ANY($2) AND is_error = false AND created_at > $3 AND created_at <= $4
        ORDER BY created_at ASC LIMIT $5`, [tenant, CRM_QUOTE_TOOLS, since.toISOString(), until.toISOString(), pageSize])).rows)
    if (rows.length === 0) break
    logs += rows.length
    const obs = rows.flatMap(observationsFromToolLog)
    observations += obs.length
    if (obs.length) {
      const ids = [...new Set(obs.map(o => o.raw.crm_log_id as string))]
      // De a 50 ids: con 400 la URL de PostgREST queda demasiado larga y la consulta falla.
      const seen = new Set<string>()
      for (let i = 0; i < ids.length; i += 50) {
        const { data: existing, error } = await db.from('flight_price_probes').select('raw').eq('source', 'crm_quote').in('raw->>crm_log_id', ids.slice(i, i + 50))
        if (error) throw new Error(`No se pudo verificar qué cotizaciones ya estaban: ${error.message}`)
        for (const e of existing ?? []) seen.add((e.raw as Record<string, unknown>)?.crm_log_id as string)
      }
      const fresh = obs.filter(o => !seen.has(o.raw.crm_log_id as string))
      skipped += obs.length - fresh.length
      for (let i = 0; i < fresh.length; i += 200) {
        const { error } = await db.from('flight_price_probes').insert(fresh.slice(i, i + 200))
        if (error) throw new Error(`No se pudieron guardar las observaciones: ${error.message}`)
        inserted += Math.min(200, fresh.length - i)
      }
    }
    since = new Date(rows[rows.length - 1].created_at)
    await db.from('ingest_cursors').upsert({ name: CURSOR, cursor_at: since.toISOString(), updated_at: new Date().toISOString(), details: { logs, inserted } })
    opts.log?.(`página ${page + 1}: ${rows.length} cotizaciones → ${obs.length} fechas con precio`)
    if (rows.length < pageSize) break
  }
  return { from, to: since.toISOString(), logs, observations, inserted, skipped }
}
