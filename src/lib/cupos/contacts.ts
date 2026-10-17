import type { Db } from '@/lib/jobs/types'

export interface AirlineContact {
  id: number; airline_code: string; airline_name: string; contact_name: string | null; email: string; cc_emails: string[]; phone: string | null; notes: string | null; active: boolean; updated_at: string
}

export interface CupoMailSettings {
  enabled: boolean; from: string | null; fromName: string | null; cc: string[]; subjectPrefix: string | null; signature: string | null; slaHours: number; slackChannelAereos: string | null
}

export async function loadAirlineContacts(db: Db, options: { activeOnly?: boolean } = {}): Promise<AirlineContact[]> {
  let q = db.from('airline_contacts').select('*').order('airline_name').order('contact_name')
  if (options.activeOnly) q = q.eq('active', true)
  const { data, error } = await q
  if (error) throw new Error(`No se pudieron leer los contactos: ${error.message}`)
  return (data ?? []) as AirlineContact[]
}

export async function loadCupoMailSettings(db: Db): Promise<CupoMailSettings> {
  const { data } = await db.from('notification_settings').select('cupo_mail_enabled, cupo_mail_from, cupo_mail_from_name, cupo_mail_cc, cupo_mail_subject_prefix, cupo_mail_signature, cupo_request_sla_hours, slack_channel_aereos').eq('id', 1).maybeSingle()
  return {
    enabled: data?.cupo_mail_enabled === true, from: (data?.cupo_mail_from as string | null) ?? null, fromName: (data?.cupo_mail_from_name as string | null) ?? null, cc: (data?.cupo_mail_cc as string[] | null) ?? [],
    subjectPrefix: (data?.cupo_mail_subject_prefix as string | null) ?? null, signature: (data?.cupo_mail_signature as string | null) ?? null, slaHours: Number(data?.cupo_request_sla_hours ?? 72), slackChannelAereos: (data?.slack_channel_aereos as string | null) ?? null,
  }
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toUpperCase()

/**
 * A quién va un pedido: los contactos de las aerolíneas que aparecen en las
 * tiradas (por código o por nombre) más los consolidadores ('*'). Si ninguna
 * aerolínea tiene contacto, van todos los activos.
 */
export function recipientsFor(contacts: AirlineContact[], options: Array<{ airline_code: string | null; airline: string | null }>): AirlineContact[] {
  const active = contacts.filter(c => c.active)
  const codes = new Set(options.map(o => norm(o.airline_code)).filter(Boolean))
  const names = options.map(o => norm(o.airline)).filter(Boolean)
  const matched = active.filter(c => c.airline_code === '*' || codes.has(norm(c.airline_code)) || names.some(n => n.includes(norm(c.airline_name)) || norm(c.airline_name).includes(n)))
  const specific = matched.filter(c => c.airline_code !== '*')
  return specific.length > 0 ? matched : active
}
