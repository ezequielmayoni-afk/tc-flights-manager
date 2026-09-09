import { enqueueJob } from '@/lib/jobs/queue'
import { MANUAL_PRIORITY } from '@/lib/jobs/lanes'
import { logEvent } from '@/lib/logs'
import { findProfileByText, loadProfiles, type ProfileRowExtra } from './profiles'
import { validateIdea } from './validate-idea'
import { isVuelosConfigured } from '@/lib/vuelos/client'
import type { Db } from '@/lib/jobs/types'
import type { DestinationProfile, Regimen } from './types'

/** Alta y arranque de ideas: lo comparten la API, "Crear idea" desde Tendencias y las fases siguientes. */

export interface NewIdeaInput {
  destinationCode?: string | null
  destinationText?: string | null
  origin?: string
  month?: string | null
  departureDate?: string | null
  flexibility?: string | null
  nights?: number | null
  adults?: number
  children?: number
  childrenAges?: number[]
  regimen?: Regimen | null
  starsMin?: number | null
  directFlight?: boolean | null
  hotelPreferred?: string | null
  budgetMaxPp?: number | null
  kind?: 'web' | 'cupo' | 'departure'
  source?: 'manual' | 'trend' | 'cupo_request' | 'departure' | 'requote' | 'gap'
  trendAlertId?: string | null
  notes?: string | null
  /** Encola la sonda y la cotización enseguida. */
  autoStart?: boolean
  createdBy?: string | null
}

export interface NewIdeaResult {
  id: number
  profile: (DestinationProfile & ProfileRowExtra) | null
  status: string
  validation: ReturnType<typeof validateIdea> | null
  jobId: number | null
}

function defaultMonth(profile: DestinationProfile | null, today = new Date()): string {
  const cursor = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3, 1))
  if (profile?.high_season_months.length) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 3 + i, 1))
      if (profile.high_season_months.includes(d.getUTCMonth() + 1)) return d.toISOString().slice(0, 7)
    }
  }
  return cursor.toISOString().slice(0, 7)
}

export async function createIdea(db: Db, input: NewIdeaInput): Promise<NewIdeaResult> {
  const profiles = await loadProfiles(db)
  const profile = input.destinationCode
    ? profiles.find(p => p.code === input.destinationCode) ?? null
    : input.destinationText ? findProfileByText(profiles, input.destinationText) : null

  const nights = input.nights ?? profile?.nights_default ?? 7
  const month = input.month ?? (input.departureDate ? input.departureDate.slice(0, 7) : defaultMonth(profile))
  const draftRow = {
    kind: input.kind ?? 'web',
    source: input.source ?? 'manual',
    status: 'draft',
    destination_code: profile?.code ?? null,
    destination_name: profile?.name ?? input.destinationText ?? 'Sin destino',
    origin: (input.origin ?? 'BUE').toUpperCase(),
    month,
    flexibility: input.flexibility ?? null,
    departure_date: input.departureDate ?? null,
    nights,
    adults: input.adults ?? 2,
    children: input.children ?? 0,
    children_ages: input.childrenAges ?? [],
    regimen: input.regimen ?? profile?.regimen_required ?? null,
    stars_min: input.starsMin ?? profile?.stars_min ?? null,
    direct_flight: input.directFlight ?? (profile?.direct_required ? true : null),
    hotel_preferred: input.hotelPreferred ?? null,
    budget_max_pp: input.budgetMaxPp ?? null,
    themes: profile?.themes_default ?? [],
    trend_alert_id: input.trendAlertId ?? null,
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  }
  const validation = profile ? validateIdea({ destinationCode: profile.code, origin: draftRow.origin, month, nights, adults: draftRow.adults, children: draftRow.children, regimen: draftRow.regimen, starsMin: draftRow.stars_min, directFlight: draftRow.direct_flight }, profile) : null

  const { data, error } = await db.from('package_ideas').insert({ ...draftRow, validation: validation ?? { ok: false, hard: ['Sin perfil de destino: elegí uno de la lista'], soft: [] } }).select('id').single()
  if (error || !data) throw new Error(`No se pudo crear la idea: ${error?.message ?? 'sin datos'}`)
  const id = (data as { id: number }).id

  let jobId: number | null = null
  let status = 'draft'
  if (input.autoStart && profile && validation?.ok) {
    const r = await startIdea(db, id, input.createdBy ?? 'ui')
    jobId = r.jobId
    status = r.status
  }
  await logEvent(db, { source: 'automation', action: 'idea.created', message: `Idea #${id}: ${draftRow.destination_name} ${nights} noches ${month}${status !== 'draft' ? ` (${status})` : ''}`, details: { ideaId: id, profile: profile?.code ?? null, source: draftRow.source, validation } }, null)
  return { id, profile, status, validation, jobId }
}

/** Encola la sonda (si hay vuelos-siviajo) o directamente la cotización. */
export async function startIdea(db: Db, ideaId: number, actor: string): Promise<{ jobId: number | null; status: string }> {
  const kind = isVuelosConfigured() ? 'idea.probe' : 'idea.quote'
  const status = kind === 'idea.probe' ? 'probing' : 'quoting'
  await db.from('package_ideas').update({ status, error: null, updated_at: new Date().toISOString() }).eq('id', ideaId)
  const job = await enqueueJob(db, { kind, payload: { ideaId }, priority: MANUAL_PRIORITY, dedupeKey: `${kind}:${ideaId}`, entityType: 'idea', entityId: ideaId, createdBy: actor, maxAttempts: 2 })
  return { jobId: job.id, status }
}
