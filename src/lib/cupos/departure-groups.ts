import { createHash } from 'node:crypto'
import type { Db } from '@/lib/jobs/types'

/**
 * Grupos de salidas automáticos.
 *
 * Un cupo (par de transportes ida/vuelta) sirve a varios productos: Río 7
 * noches, Búzios 7, Río 4 + Búzios 3. Y el mismo producto se repite en cada
 * cupo nuevo (otra fecha, otro tc_package_id). El grupo es el producto:
 * misma firma (origen + destinos en orden + noches) en distintas fechas.
 * Cuando la salida de una fecha se agota, la redirección busca la misma
 * firma en la siguiente fecha con lugares (los vínculos con el cupo dicen
 * si los tiene). Un grupo puesto a mano (id sin prefijo "auto:") se respeta.
 */

export const AUTO_GROUP_PREFIX = 'auto:'

export interface GroupablePackage {
  id: number
  originCode: string | null
  destinationCodes: string[]
  nightsCount: number | null
  departureDate: string | null
  currentGroupId: string | null
}

export function productSignature(p: Pick<GroupablePackage, 'originCode' | 'destinationCodes' | 'nightsCount'>): string | null {
  if (p.destinationCodes.length === 0) return null
  return `${(p.originCode ?? 'BUE').toUpperCase()}|${p.destinationCodes.map(c => c.toUpperCase()).join('+')}|${p.nightsCount ?? '?'}`
}

export function autoGroupId(signature: string): string {
  return `${AUTO_GROUP_PREFIX}${createHash('sha1').update(signature).digest('hex').slice(0, 10)}`
}

export interface GroupAssignment {
  packageId: number
  groupId: string | null
  index: number | null
  signature: string | null
}

/** Asigna grupo e índice (por fecha) a los paquetes cuya firma se repite en más de una fecha. Puro. */
export function groupBySignature(packages: GroupablePackage[]): GroupAssignment[] {
  const bySignature = new Map<string, GroupablePackage[]>()
  for (const p of packages) {
    const sig = productSignature(p)
    if (!sig) continue
    if (!bySignature.has(sig)) bySignature.set(sig, [])
    bySignature.get(sig)!.push(p)
  }
  const assignments: GroupAssignment[] = []
  for (const [signature, members] of bySignature) {
    const dates = new Set(members.map(m => m.departureDate).filter(Boolean))
    const manual = members.find(m => m.currentGroupId && !m.currentGroupId.startsWith(AUTO_GROUP_PREFIX))
    const groupId = dates.size > 1 ? (manual?.currentGroupId ?? autoGroupId(signature)) : null
    const sorted = [...members].sort((a, b) => (a.departureDate ?? '9999').localeCompare(b.departureDate ?? '9999') || a.id - b.id)
    sorted.forEach((m, i) => {
      // Un grupo manual no se toca; un auto se recalcula; sin grupo se asigna si hay más de una fecha.
      if (m.currentGroupId && !m.currentGroupId.startsWith(AUTO_GROUP_PREFIX) && m.currentGroupId !== groupId) return
      assignments.push({ packageId: m.id, groupId, index: groupId ? i + 1 : null, signature })
    })
  }
  return assignments
}

interface PackageRow {
  id: number
  origin_code: string | null
  nights_count: number | null
  departure_date: string | null
  departure_group_id: string | null
  package_destinations: Array<{ destination_code: string | null; sort_order: number | null }> | null
}

/** Recalcula los grupos automáticos sobre todos los paquetes (también los vencidos: son el "desde" de una redirección). */
export async function refreshDepartureGroups(db: Db): Promise<{ scanned: number; grouped: number; groups: number; changed: number }> {
  const { data } = await db.from('packages').select('id, origin_code, nights_count, departure_date, departure_group_id, package_destinations(destination_code, sort_order)')
  const rows = (data ?? []) as PackageRow[]
  const packages: GroupablePackage[] = rows.map(r => ({
    id: r.id,
    originCode: r.origin_code,
    destinationCodes: (r.package_destinations ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(d => d.destination_code ?? '').filter(Boolean),
    nightsCount: r.nights_count,
    departureDate: r.departure_date,
    currentGroupId: r.departure_group_id,
  }))
  const assignments = groupBySignature(packages)
  const current = new Map(rows.map(r => [r.id, r.departure_group_id]))
  let changed = 0
  for (const a of assignments) {
    const before = current.get(a.packageId) ?? null
    if (before === a.groupId && a.groupId === null) continue
    const { error } = await db.from('packages').update({ departure_group_id: a.groupId, departure_index: a.index }).eq('id', a.packageId)
    if (!error && before !== a.groupId) changed++
  }
  const grouped = assignments.filter(a => a.groupId)
  return { scanned: rows.length, grouped: grouped.length, groups: new Set(grouped.map(a => a.groupId)).size, changed }
}
