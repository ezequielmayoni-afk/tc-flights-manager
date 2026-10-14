import type { Db } from '@/lib/jobs/types'

/** Familia de destino → campaña y conjunto plantilla en Meta (tabla marketing_families). */
export interface MarketingFamily {
  key: string
  name: string
  metaCampaignId: string | null
  templateAdsetId: string | null
  dailyBudgetCents: number | null
  targetCpconUsd: number | null
  targetCpaUsd: number | null
  maxActiveAdsPerAdset: number
  autoLaunch: boolean
  active: boolean
  notes: string | null
  sortOrder: number
}

export async function loadFamilies(db: Db): Promise<MarketingFamily[]> {
  const { data, error } = await db.from('marketing_families').select('*').order('sort_order')
  if (error) throw new Error(`No se pudieron leer las familias: ${error.message}`)
  return ((data ?? []) as Array<Record<string, unknown>>).map(r => ({
    key: String(r.key), name: String(r.name), metaCampaignId: (r.meta_campaign_id as string | null) ?? null, templateAdsetId: (r.template_adset_id as string | null) ?? null,
    dailyBudgetCents: r.daily_budget_cents === null || r.daily_budget_cents === undefined ? null : Number(r.daily_budget_cents),
    targetCpconUsd: r.target_cpcon_usd === null || r.target_cpcon_usd === undefined ? null : Number(r.target_cpcon_usd),
    targetCpaUsd: r.target_cpa_usd === null || r.target_cpa_usd === undefined ? null : Number(r.target_cpa_usd),
    maxActiveAdsPerAdset: Number(r.max_active_ads_per_adset ?? 4), autoLaunch: r.auto_launch === true, active: r.active !== false, notes: (r.notes as string | null) ?? null, sortOrder: Number(r.sort_order ?? 0),
  }))
}

const EVENT_RE = /\b(f1|f[oó]rmula ?1|formula ?1|grand prix|gp\b|interlagos|rugby|mundial|moto ?gp|copa am[eé]rica|champions|nations championship|los pumas)\b/i
const FAMILY_BY_PROFILE: Record<string, string> = { caribe: 'caribe', brasil: 'brasil', europa: 'europa_exoticos', medio_oriente_asia: 'europa_exoticos', usa: 'usa', argentina: 'argentina' }

/**
 * A qué familia pertenece un paquete. El override manual manda; después los
 * eventos deportivos (van a ABO_SPORTS aunque el destino sea Brasil); después
 * la familia del perfil del destino; una salida grupal sin perfil va con
 * Europa y exóticos, que es donde viven las grupales acompañadas.
 */
export function familyKeyForPackage(pkg: { title: string; themes?: string[] | null; profileFamily: string | null; operatorDeparture: boolean; override?: string | null }): string | null {
  if (pkg.override) return pkg.override
  const themes = (pkg.themes ?? []).join(' ')
  if (EVENT_RE.test(pkg.title) || /\b(sport|deporte|f1|rugby)/i.test(themes)) return 'eventos'
  if (pkg.profileFamily && FAMILY_BY_PROFILE[pkg.profileFamily]) return FAMILY_BY_PROFILE[pkg.profileFamily]
  if (pkg.operatorDeparture) return 'europa_exoticos'
  return null
}

const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

/** Nombre del conjunto: DESTINO_MES_SIV_ID. Legible en el Ads Manager y parseable (SIV + id) por el CRM y por HUB. */
export function adsetNameFor(input: { destination: string; departureDate: string | null; tcPackageId: number }): string {
  const dest = input.destination.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 28)
  const month = input.departureDate ? MONTHS[Number(input.departureDate.slice(5, 7)) - 1] : null
  return [dest || 'PAQUETE', month, 'SIV', String(input.tcPackageId)].filter(Boolean).join('_')
}
