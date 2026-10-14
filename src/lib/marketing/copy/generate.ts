import { getAnthropicClient } from '@/lib/anthropic/client'
import { calculateCupos, findFlightsForPackages } from '@/lib/packages/flight-match'
import { getCupoPackageIds } from '@/lib/packages/cupo'
import { buildWaMessage, getPackageDestinationLabel } from '@/lib/meta-ads/wa-message'
import type { Db } from '@/lib/jobs/types'
import { ANGLES, type Angle } from '../brand'
import { buildCopySystemPrompt, buildCopyUserPrompt } from './prompt'
import { qaCopy } from './qa'
import type { CopyPackageData, GeneratedCopy } from './types'

export const COPY_ENGINE_VERSION = 'brand_voice_v1'

/** Los regímenes vienen de TC en inglés; al copy van en español. */
export function boardLabel(raw: string | null): string | null {
  if (!raw) return null
  const k = raw.trim().toUpperCase()
  const map: Array<[RegExp, string]> = [[/ALL.?INCLUSIVE/, 'todo incluido'], [/BREAKFAST|DESAYUNO|BED AND|B&B/, 'con desayuno'], [/HALF.?BOARD|MEDIA PENSI/, 'media pensión'], [/FULL.?BOARD|PENSI[OÓ]N COMPLETA/, 'pensión completa'], [/ROOM.?ONLY|NO MEALS|SIN COMIDAS|SOLO ALOJ/, 'sólo alojamiento']]
  for (const [re, label] of map) if (re.test(k)) return label
  return raw.toLowerCase()
}
const MODEL = 'claude-sonnet-5'
const FALLBACK_MODEL = 'claude-haiku-4-5-20251001'

/** Lee del paquete todo lo que el copy puede nombrar. Nada más: lo que no está acá, el modelo no lo inventa. */
export async function loadCopyPackageData(db: Db, packageId: number): Promise<CopyPackageData> {
  const { data: pkg, error } = await db.from('packages').select(`
    id, tc_package_id, title, current_price_per_pax, currency, departure_date, flight_departure_date, date_range_start, date_range_end, nights_count, adults_count, children_count,
    airline_name, themes, themes_local, destination_profile_code, marketing_family, transports_count, hotels_count, transfers_count, tours_count, tickets_count,
    package_destinations(destination_name, sort_order), package_hotels(hotel_name, stars, hotel_category, board_name, board_type, nights, sort_order),
    package_transports(origin_name, origin_code, marketing_airline_code, company, num_segments, direction, departure_date, supplier_name, sort_order)
  `).eq('id', packageId).maybeSingle()
  if (error || !pkg) throw new Error(`Paquete ${packageId} no encontrado${error ? `: ${error.message}` : ''}`)
  const dests = [...((pkg.package_destinations ?? []) as Array<{ destination_name: string | null; sort_order: number | null }>)].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(d => d.destination_name ?? '').filter(Boolean)
  const hotels = [...((pkg.package_hotels ?? []) as Array<{ hotel_name: string | null; stars: number | null; hotel_category: string | null; board_name: string | null; board_type: string | null; nights: number | null; sort_order: number | null }>)].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const hotel = hotels[0]
  const transports = [...((pkg.package_transports ?? []) as Array<{ origin_name: string | null; origin_code: string | null; marketing_airline_code: string | null; company: string | null; num_segments: number | null; direction: string | null; departure_date: string | null; supplier_name: string | null; sort_order: number | null }>)].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
  const outbound = transports[0]
  const profileFamily = pkg.marketing_family ?? null
  let family: string | null = profileFamily
  if (!family && pkg.destination_profile_code) {
    const { data: prof } = await db.from('destination_profiles').select('family').eq('code', pkg.destination_profile_code).maybeSingle()
    family = (prof?.family as string | null) ?? null
  }
  const cupoIds = await getCupoPackageIds(db, [packageId])
  let cupoRemaining: number | null = null
  let isOperatorDeparture = false
  if (cupoIds.has(packageId)) {
    const matches = (await findFlightsForPackages(db, [packageId])).get(packageId) ?? []
    if (matches.length > 0) cupoRemaining = Math.max(...matches.map(m => m.cupos.remaining))
    else isOperatorDeparture = true
  }
  void calculateCupos
  return {
    packageId: pkg.id, tcPackageId: pkg.tc_package_id, title: pkg.title, destinations: dests, primaryDestination: dests[0] ?? pkg.title, family,
    hotelName: hotel?.hotel_name ?? null, hotelStars: hotel?.stars ? Number(hotel.stars) : null, boardName: boardLabel(hotel?.board_name ?? hotel?.board_type ?? null),
    nights: pkg.nights_count ? Number(pkg.nights_count) : hotel?.nights ? Number(hotel.nights) : null,
    pricePerPax: pkg.current_price_per_pax === null ? null : Number(pkg.current_price_per_pax), currency: pkg.currency || 'USD',
    departureDate: pkg.flight_departure_date ?? pkg.departure_date ?? outbound?.departure_date ?? null, dateRangeStart: pkg.date_range_start ?? null, dateRangeEnd: pkg.date_range_end ?? null,
    airline: pkg.airline_name ?? outbound?.company ?? outbound?.marketing_airline_code ?? null, directFlight: outbound ? (outbound.num_segments ?? 1) <= 1 : null, originCity: outbound?.origin_name ?? null,
    includes: { flights: (pkg.transports_count ?? 0) > 0, hotel: (pkg.hotels_count ?? 0) > 0, transfers: (pkg.transfers_count ?? 0) > 0, tours: (pkg.tours_count ?? 0) > 0, tickets: (pkg.tickets_count ?? 0) > 0 },
    cupoRemaining, isOperatorDeparture, themes: ((pkg.themes_local as string[] | null) ?? (pkg.themes as string[] | null) ?? []), adults: Number(pkg.adults_count ?? 2), children: Number(pkg.children_count ?? 0),
  }
}

async function askModel(system: string, user: string, model: string): Promise<string> {
  const client = getAnthropicClient()
  // Sin temperature: los modelos de la familia 5 la rechazan (400 "temperature is deprecated").
  const msg = await client.messages.create({ model, max_tokens: 3000, system, messages: [{ role: 'user', content: user }] })
  return msg.content.map(c => (c.type === 'text' ? c.text : '')).join('')
}

export function parseCopies(raw: string): GeneratedCopy[] {
  let text = raw.trim()
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence) text = fence[1].trim()
  const start = text.indexOf('{'); const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('El modelo no devolvió JSON')
  const parsed = JSON.parse(text.slice(start, end + 1)) as { copies?: unknown }
  if (!Array.isArray(parsed.copies)) throw new Error('JSON sin "copies"')
  return (parsed.copies as Array<Record<string, unknown>>).map((c, i) => ({
    variant: Number(c.variant ?? i + 1), angle: String(c.angle ?? ''), primary_text: String(c.primary_text ?? ''), headline: String(c.headline ?? ''), description: String(c.description ?? ''),
  }))
}

export interface GenerateCopiesResult {
  packageId: number
  model: string
  saved: GeneratedCopy[]
  rejected: Array<{ variant: number; issues: string[] }>
  fixed: number
}

/**
 * Genera un copy por ángulo con la voz de marca, lo pasa por QA y lo guarda en
 * meta_ad_copies (variant = ángulo). Los rechazados se reintentan una vez
 * pidiéndole al modelo sólo esos ángulos con el motivo del rechazo.
 */
export async function generateBrandCopies(db: Db, packageId: number, options: { angles?: Angle[]; actor?: string } = {}): Promise<GenerateCopiesResult> {
  const pkg = await loadCopyPackageData(db, packageId)
  const angles = options.angles ?? ANGLES
  const system = buildCopySystemPrompt()
  let model = MODEL
  let raw: string
  try { raw = await askModel(system, buildCopyUserPrompt(pkg, angles), model) } catch (err) { console.warn(`[copy] ${MODEL} falló (${err instanceof Error ? err.message : String(err)}); uso ${FALLBACK_MODEL}`); model = FALLBACK_MODEL; raw = await askModel(system, buildCopyUserPrompt(pkg, angles), model) }
  const first = parseCopies(raw)
  const byVariant = new Map<number, GeneratedCopy>()
  for (const c of first) byVariant.set(c.variant, c)

  const saved: GeneratedCopy[] = []
  const rejected: Array<{ variant: number; issues: string[] }> = []
  let fixed = 0
  const pending: Array<{ angle: Angle; issues: string[] }> = []
  for (const angle of angles) {
    const c = byVariant.get(angle.variant)
    if (!c) { pending.push({ angle, issues: ['El modelo no devolvió este ángulo'] }); continue }
    const qa = qaCopy({ ...c, angle: angle.key }, pkg)
    if (qa.status === 'rejected') pending.push({ angle, issues: qa.issues })
    else { if (qa.status === 'fixed') fixed++; saved.push(qa.copy) }
  }
  if (pending.length > 0) {
    const retryPrompt = buildCopyUserPrompt(pkg, pending.map(p => p.angle)) + '\n\n== CORRECCIONES ==\n' + pending.map(p => `- Ángulo ${p.angle.variant} (${p.angle.key}): el intento anterior se rechazó por: ${p.issues.join('; ')}. Escribilo de nuevo respetando los datos.`).join('\n')
    try {
      for (const c of parseCopies(await askModel(system, retryPrompt, model))) {
        const angle = pending.find(p => p.angle.variant === c.variant)?.angle
        if (!angle) continue
        const qa = qaCopy({ ...c, angle: angle.key }, pkg)
        if (qa.status === 'rejected') rejected.push({ variant: angle.variant, issues: qa.issues })
        else { if (qa.status === 'fixed') fixed++; saved.push(qa.copy) }
      }
    } catch (err) {
      for (const p of pending) rejected.push({ variant: p.angle.variant, issues: [...p.issues, `reintento falló: ${err instanceof Error ? err.message : String(err)}`] })
    }
    for (const p of pending) if (!saved.some(s => s.variant === p.angle.variant) && !rejected.some(r => r.variant === p.angle.variant)) rejected.push({ variant: p.angle.variant, issues: p.issues })
  }

  const now = new Date().toISOString()
  const waMessageTemplate = buildWaMessage(await getPackageDestinationLabel(db, packageId), pkg.tcPackageId)
  for (const c of saved) {
    const { error } = await db.from('meta_ad_copies').upsert({
      package_id: packageId, tc_package_id: pkg.tcPackageId, variant: c.variant, headline: c.headline, primary_text: c.primary_text, description: c.description || null,
      wa_message_template: waMessageTemplate, angle: c.angle, source: `${COPY_ENGINE_VERSION}:${model}`, generated_by: 'ai', approved: false, updated_at: now,
    }, { onConflict: 'package_id,variant' })
    if (error) throw new Error(`No se pudo guardar el copy ${c.variant}: ${error.message}`)
  }
  if (saved.length > 0) await db.from('packages').update({ marketing_status: 'copy_generated' }).eq('id', packageId).is('marketing_status', null)
  return { packageId, model, saved, rejected, fixed }
}
