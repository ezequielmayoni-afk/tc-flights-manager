import type { PoolClient } from 'pg'

/** Consultas al CRM, todas con tenant y rango. Devuelven filas crudas; la lógica va en rollup.ts. */

export interface SivMessageRow { contact_id: string; created_at: Date; searchable_text: string }
export interface AttributionRow { contact_id: string; timestamp: Date; metadata: Record<string, unknown> | null }
export interface ContactRow { id: string; assigned_user_id: string | null; assigned_team_id: string | null; owner_id: string | null; created_at: Date; first_interaction_at: Date | null }
export interface OpportunityRow { id: string; contact_id: string; stage: string | null; status: string | null; is_primary: boolean | null; created_at: Date; closed_at: Date | null; closed_reason: string | null; quoted_value: string | null; final_value: string | null; profit: string | null; currency: string | null; quotation_count: number | null }
export interface CapiRow { contact_id: string; event_name: string }
export interface UserRow { id: string; first_name: string | null; last_name: string | null; email: string | null; user_group: string | null }
export interface TeamRow { id: string; name: string }
export interface AdRow { id: string; name: string | null; adset_id: string | null; campaign_id: string | null; adset_name: string | null; campaign_name: string | null }

const chunk = <T,>(arr: T[], n: number) => { const out: T[][] = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out }

export async function sivMessagesInWindow(c: PoolClient, tenant: string, from: Date, to: Date): Promise<SivMessageRow[]> {
  const { rows } = await c.query<SivMessageRow>(`SELECT contact_id, created_at, searchable_text FROM messages WHERE tenant_id = $1 AND created_at >= $2 AND created_at < $3 AND direction = 'inbound' AND contact_id IS NOT NULL AND searchable_text ~* 'SIV[ _-]?[0-9]{6,9}' ORDER BY created_at`, [tenant, from, to])
  return rows
}

export async function attributionsForContacts(c: PoolClient, tenant: string, contactIds: string[], since: Date): Promise<AttributionRow[]> {
  const out: AttributionRow[] = []
  for (const ids of chunk(contactIds, 500)) {
    const { rows } = await c.query<AttributionRow>(`SELECT contact_id, "timestamp", metadata FROM contact_attribution_history WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[]) AND "timestamp" >= $3 ORDER BY "timestamp"`, [tenant, ids, since])
    out.push(...rows)
  }
  return out
}

export async function contactsById(c: PoolClient, tenant: string, contactIds: string[]): Promise<ContactRow[]> {
  const out: ContactRow[] = []
  for (const ids of chunk(contactIds, 500)) {
    const { rows } = await c.query<ContactRow>(`SELECT id, assigned_user_id, assigned_team_id, owner_id, created_at, first_interaction_at FROM contacts WHERE tenant_id = $1 AND id = ANY($2::uuid[])`, [tenant, ids])
    out.push(...rows)
  }
  return out
}

export async function opportunitiesForContacts(c: PoolClient, tenant: string, contactIds: string[]): Promise<OpportunityRow[]> {
  const out: OpportunityRow[] = []
  for (const ids of chunk(contactIds, 500)) {
    const { rows } = await c.query<OpportunityRow>(`SELECT id, contact_id, stage, status, is_primary, created_at, closed_at, closed_reason, quoted_value, final_value, profit, currency, quotation_count FROM opportunities WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[]) AND deleted_at IS NULL ORDER BY is_primary DESC NULLS LAST, created_at DESC`, [tenant, ids])
    out.push(...rows)
  }
  return out
}

export async function capiForContacts(c: PoolClient, tenant: string, contactIds: string[], since: Date): Promise<CapiRow[]> {
  const out: CapiRow[] = []
  for (const ids of chunk(contactIds, 500)) {
    const { rows } = await c.query<CapiRow>(`SELECT DISTINCT contact_id, event_name FROM capi_event_logs WHERE tenant_id = $1 AND contact_id = ANY($2::uuid[]) AND created_at >= $3 AND COALESCE(is_test_event, false) = false`, [tenant, ids, since])
    out.push(...rows)
  }
  return out
}

export async function usersAndTeams(c: PoolClient, tenant: string): Promise<{ users: UserRow[]; teams: TeamRow[] }> {
  const { rows: users } = await c.query<UserRow>(`SELECT id, first_name, last_name, email, user_group FROM users WHERE tenant_id = $1`, [tenant])
  const { rows: teams } = await c.query<TeamRow>(`SELECT id, name FROM teams WHERE tenant_id = $1`, [tenant])
  return { users, teams }
}

export async function adsById(c: PoolClient, tenant: string, adIds: string[]): Promise<AdRow[]> {
  const out: AdRow[] = []
  for (const ids of chunk(adIds, 500)) {
    const { rows } = await c.query<AdRow>(`SELECT a.id, a.name, a.adset_id, a.campaign_id, s.name AS adset_name, cp.name AS campaign_name FROM meta_ads_ads a LEFT JOIN meta_ads_adsets s ON s.id = a.adset_id LEFT JOIN meta_ads_campaigns cp ON cp.id = a.campaign_id WHERE a.tenant_id = $1 AND a.id = ANY($2::text[])`, [tenant, ids])
    out.push(...rows)
  }
  return out
}
