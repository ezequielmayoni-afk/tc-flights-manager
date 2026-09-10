import { slugify } from '@/lib/tendencias/config'
import type { Db } from '@/lib/jobs/types'
import type { DestinationProfile, Regimen, StopoverModifiers } from './types'

/** Filas de destination_profiles → tipo del módulo. */
export function rowToProfile(row: Record<string, unknown>): DestinationProfile {
  return {
    code: String(row.code),
    name: String(row.name),
    aliases: (row.aliases as string[] | null) ?? [],
    family: row.family as DestinationProfile['family'],
    tc_destination_code: (row.tc_destination_code as string | null) ?? null,
    iata_airport: (row.iata_airport as string | null) ?? null,
    regimen_required: (row.regimen_required as Regimen | null) ?? null,
    regimen_allowed: (row.regimen_allowed as Regimen[] | null) ?? [],
    nights_default: Number(row.nights_default ?? 7),
    nights_allowed: (row.nights_allowed as number[] | null) ?? [],
    stars_default: Number(row.stars_default ?? 4),
    stars_min: Number(row.stars_min ?? 3),
    high_season_months: (row.high_season_months as number[] | null) ?? [],
    booking_window_days: Number(row.booking_window_days ?? 90),
    stopover_threshold_pct: row.stopover_threshold_pct === null || row.stopover_threshold_pct === undefined ? null : Number(row.stopover_threshold_pct),
    stopover_modifiers: (row.stopover_modifiers as StopoverModifiers | null) ?? { short_trip: 10, kids: 5, overnight: 12, origin_interior: -7, half_direct: 0.66 },
    airlines_by_origin: (row.airlines_by_origin as Record<string, string[]> | null) ?? {},
    themes_default: (row.themes_default as string[] | null) ?? [],
    direct_required: Boolean(row.direct_required),
    auto_publish: Boolean(row.auto_publish),
    auto_requote: Boolean(row.auto_requote),
    price_tolerance_pct: Number(row.price_tolerance_pct ?? 3),
    active: row.active !== false,
  }
}

export interface ProfileRowExtra {
  cotizador_instance: 'emisivo' | 'nacional'
  trend_slug: string | null
  notes: string | null
  review_pending: boolean
}

export async function loadProfiles(db: Db, options: { activeOnly?: boolean } = {}): Promise<Array<DestinationProfile & ProfileRowExtra>> {
  let query = db.from('destination_profiles').select('*').order('family').order('name')
  if (options.activeOnly) query = query.eq('active', true)
  const { data, error } = await query
  if (error) throw new Error(`No se pudieron leer los perfiles: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    ...rowToProfile(row),
    cotizador_instance: (row.cotizador_instance as 'emisivo' | 'nacional') ?? 'emisivo',
    trend_slug: (row.trend_slug as string | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    review_pending: Boolean(row.review_pending),
  }))
}

export async function getProfile(db: Db, code: string): Promise<(DestinationProfile & ProfileRowExtra) | null> {
  const { data } = await db.from('destination_profiles').select('*').eq('code', code).maybeSingle()
  if (!data) return null
  const row = data as Record<string, unknown>
  return { ...rowToProfile(row), cotizador_instance: (row.cotizador_instance as 'emisivo' | 'nacional') ?? 'emisivo', trend_slug: (row.trend_slug as string | null) ?? null, notes: (row.notes as string | null) ?? null, review_pending: Boolean(row.review_pending) }
}

/**
 * Encuentra el perfil que corresponde a un texto libre (nombre de destino de
 * TC, slug de Tendencias, lo que escribió alguien). Compara por slug del
 * nombre, alias y trend_slug; primero exacto, después contención por token.
 */
export function findProfileByText<T extends DestinationProfile & { trend_slug: string | null }>(profiles: T[], text: string): T | null {
  const needle = slugify(text)
  if (!needle) return null
  const exact = profiles.find(p => slugify(p.name) === needle || p.trend_slug === needle || p.aliases.some(a => slugify(a) === needle) || p.code.toLowerCase() === needle)
  if (exact) return exact
  const tokens = needle.split('-')
  const matches = (candidate: string) => {
    const c = slugify(candidate)
    if (!c || c.length < 4) return false
    const ct = c.split('-')
    for (let i = 0; i + ct.length <= tokens.length; i++) if (ct.every((t, j) => tokens[i + j] === t)) return true
    return false
  }
  return profiles.find(p => matches(p.name) || p.aliases.some(matches) || (p.trend_slug ? matches(p.trend_slug) : false)) ?? null
}

export interface NewProfileInput {
  name: string
  code?: string | null
  family: DestinationProfile['family']
  iata_airport?: string | null
  tc_destination_code?: string | null
  cotizador_instance?: 'emisivo' | 'nacional'
  regimen_required?: Regimen | null
  nights_default?: number | null
  nights_allowed?: number[] | null
  stars_min?: number | null
  direct_required?: boolean
  trend_slug?: string | null
  aliases?: string[]
  notes?: string | null
  created_by?: string | null
  created_from?: string | null
}

/** Código corto a partir del aeropuerto o del nombre (único). */
export function suggestProfileCode(input: { name: string; iata_airport?: string | null }, existing: Set<string>): string {
  const base = (input.iata_airport && /^[A-Za-z]{3}$/.test(input.iata_airport) ? input.iata_airport : slugify(input.name).replace(/-/g, '').slice(0, 6)).toUpperCase()
  if (!existing.has(base)) return base
  for (let i = 2; i < 100; i++) if (!existing.has(`${base}-${i}`)) return `${base}-${i}`
  return `${base}-${Date.now().toString(36)}`
}

/** Alta de un perfil con los mínimos; el resto toma defaults razonables y queda pendiente de revisión. */
export async function createProfile(db: Db, input: NewProfileInput): Promise<DestinationProfile & ProfileRowExtra> {
  const { data: codes } = await db.from('destination_profiles').select('code')
  const existing = new Set(((codes ?? []) as Array<{ code: string }>).map(c => c.code.toUpperCase()))
  const code = (input.code?.trim().toUpperCase() || suggestProfileCode(input, existing))
  if (existing.has(code)) throw new Error(`Ya existe un perfil con el código ${code}`)
  const nightsDefault = input.nights_default ?? 7
  const row = {
    code,
    name: input.name.trim(),
    aliases: [...new Set([slugify(input.name).replace(/-/g, ' '), ...(input.aliases ?? [])].map(a => a.toLowerCase().trim()).filter(Boolean))],
    family: input.family,
    tc_destination_code: input.tc_destination_code?.trim() || null,
    iata_airport: input.iata_airport?.trim().toUpperCase() || null,
    cotizador_instance: input.cotizador_instance ?? (input.family === 'argentina' ? 'nacional' : 'emisivo'),
    regimen_required: input.regimen_required ?? null,
    regimen_allowed: input.regimen_required ? [input.regimen_required] : [],
    nights_default: nightsDefault,
    nights_allowed: input.nights_allowed?.length ? input.nights_allowed : [nightsDefault - 1, nightsDefault, nightsDefault + 1].filter(n => n > 0),
    stars_default: Math.max(input.stars_min ?? 4, 3),
    stars_min: input.stars_min ?? 3,
    high_season_months: [],
    booking_window_days: 90,
    stopover_threshold_pct: input.family === 'medio_oriente_asia' ? null : 17,
    direct_required: Boolean(input.direct_required),
    trend_slug: input.trend_slug ?? slugify(input.name),
    review_pending: true,
    created_from: input.created_from ?? 'tendencias',
    created_by: input.created_by ?? null,
    notes: input.notes ?? 'Creado desde Tendencias: revisar régimen, noches, temporada y umbral de escala.',
  }
  const { data, error } = await db.from('destination_profiles').insert(row).select('*').single()
  if (error || !data) throw new Error(`No se pudo crear el perfil: ${error?.message ?? 'sin datos'}`)
  const r = data as Record<string, unknown>
  return { ...rowToProfile(r), cotizador_instance: r.cotizador_instance as 'emisivo' | 'nacional', trend_slug: (r.trend_slug as string | null) ?? null, notes: (r.notes as string | null) ?? null, review_pending: true }
}
