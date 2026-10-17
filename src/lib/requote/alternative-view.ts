import type { Db } from '@/lib/jobs/types'

/** Forma con la que las pantallas muestran una propuesta de fecha alternativa (misma que usa la tarea de cupos agotados). */
export interface AlternativeView {
  id: number; packageId: number; status: 'proposed' | 'approved' | 'rejected' | 'applying' | 'applied' | 'failed' | 'superseded'; trigger: string | null
  seasonKind: string | null; windowFrom: string | null; windowTo: string | null; currentDeparture: string | null; currentPricePp: number | null
  proposedDeparture: string | null; proposedReturn: string | null; pricePp: number | null; variancePct: number | null; airline: string | null; flightNumbers: string[]; direct: boolean | null
  hotelNames: string[]; hotelMatched: boolean | null; note: string | null; reason: string | null; createdAt: string
}

export function rowToAlternativeView(a: Record<string, unknown>): AlternativeView {
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return {
    id: Number(a.id), packageId: Number(a.package_id), status: String(a.status) as AlternativeView['status'], trigger: (a.trigger as string | null) ?? null,
    seasonKind: (a.season_kind as string | null) ?? null, windowFrom: (a.window_from as string | null) ?? null, windowTo: (a.window_to as string | null) ?? null, currentDeparture: (a.current_departure as string | null) ?? null, currentPricePp: num(a.current_price_pp),
    proposedDeparture: (a.proposed_departure as string | null) ?? null, proposedReturn: (a.proposed_return as string | null) ?? null, pricePp: num(a.price_pp), variancePct: num(a.variance_pct), airline: (a.airline as string | null) ?? null, flightNumbers: (a.flight_numbers as string[] | null) ?? [], direct: (a.direct as boolean | null) ?? null,
    hotelNames: (a.hotel_names as string[] | null) ?? [], hotelMatched: (a.hotel_matched as boolean | null) ?? null, note: (a.stopover_note as string | null) ?? null, reason: (a.reason as string | null) ?? null, createdAt: String(a.created_at),
  }
}

/** La última propuesta viva (o fallida) de cada paquete. */
export async function latestAlternatives(db: Db, packageIds: number[]): Promise<Map<number, AlternativeView>> {
  const out = new Map<number, AlternativeView>()
  if (packageIds.length === 0) return out
  const { data } = await db.from('requote_alternatives').select('*').in('package_id', packageIds).in('status', ['proposed', 'approved', 'applying', 'applied', 'failed']).order('created_at', { ascending: false })
  for (const a of (data ?? []) as Array<Record<string, unknown>>) { const pid = Number(a.package_id); if (!out.has(pid)) out.set(pid, rowToAlternativeView(a)) }
  return out
}
