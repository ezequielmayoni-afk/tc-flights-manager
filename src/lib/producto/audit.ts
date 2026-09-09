import { getCupoPackageIds } from '@/lib/packages/cupo'
import { canonicalRegimen } from './idea-builder'
import { findProfileByText, loadProfiles } from './profiles'
import type { Db } from '@/lib/jobs/types'
import type { DestinationProfile } from './types'

/**
 * Auditoría de perfil: cada paquete activo contra los usos y costumbres de
 * su destino. Sólo informa (profile_violations); no bloquea nada.
 */

export interface AuditHotel { board_type: string | null; board_name: string | null; stars: number | null; hotel_category: string | null }
export interface AuditPackage { id: number; tc_package_id: number; title: string; nights_count: number | null; destinationNames: string[]; hotels: AuditHotel[] }

export function auditPackage(pkg: AuditPackage, profile: DestinationProfile): string[] {
  const violations: string[] = []
  if (profile.regimen_required && pkg.hotels.length > 0) {
    const boards = pkg.hotels.map(h => canonicalRegimen(h.board_name ?? h.board_type)).filter(Boolean)
    if (boards.length > 0 && !boards.includes(profile.regimen_required)) {
      violations.push(`${profile.name} se vende con ${profile.regimen_required.replace('_', ' ')}; el paquete tiene ${[...new Set(pkg.hotels.map(h => h.board_name ?? h.board_type).filter(Boolean))].join(', ')}`)
    }
  }
  if (profile.nights_allowed.length > 0 && pkg.nights_count) {
    const closest = Math.min(...profile.nights_allowed.map(n => Math.abs(n - (pkg.nights_count ?? 0))))
    if (closest > 1) violations.push(`${pkg.nights_count} noches no es habitual para ${profile.name} (habituales: ${profile.nights_allowed.join(', ')})`)
  }
  const stars = pkg.hotels.map(h => h.stars ?? parseInt(h.hotel_category ?? '', 10)).filter(s => Number.isFinite(s) && s > 0)
  if (stars.length > 0 && Math.min(...stars) < profile.stars_min) {
    violations.push(`Hotel de ${Math.min(...stars)} estrellas; ${profile.name} se vende desde ${profile.stars_min}`)
  }
  return violations
}

export interface ProfileAuditSummary {
  scanned: number
  matched: number
  withViolations: number
  unmatched: string[]
}

export async function runProfileAudit(db: Db, log: (m: string, d?: Record<string, unknown>, l?: 'info' | 'warning' | 'error') => Promise<void>): Promise<ProfileAuditSummary> {
  const profiles = await loadProfiles(db, { activeOnly: true })
  const { data } = await db
    .from('packages')
    .select('id, tc_package_id, title, nights_count, package_destinations(destination_name, sort_order), package_hotels(board_type, board_name, stars, hotel_category)')
    .eq('tc_active', true)
    .not('status', 'in', '("expired","not_visible")')
  const rows = (data ?? []) as Array<{ id: number; tc_package_id: number; title: string; nights_count: number | null; package_destinations: Array<{ destination_name: string | null; sort_order: number | null }> | null; package_hotels: AuditHotel[] | null }>
  const cupoIds = await getCupoPackageIds(db, rows.map(r => r.id))
  const summary: ProfileAuditSummary = { scanned: rows.length, matched: 0, withViolations: 0, unmatched: [] }
  const now = new Date().toISOString()

  for (const r of rows) {
    const names = (r.package_destinations ?? []).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(d => d.destination_name ?? '').filter(Boolean)
    const profile = names.map(n => findProfileByText(profiles, n)).find(Boolean) ?? findProfileByText(profiles, r.title)
    const isCupo = cupoIds.has(r.id)
    if (!profile) {
      summary.unmatched.push(`${r.tc_package_id} ${names.join('+') || r.title}`)
      await db.from('packages').update({ is_cupo: isCupo, profile_violations: null }).eq('id', r.id)
      continue
    }
    summary.matched++
    const violations = auditPackage({ id: r.id, tc_package_id: r.tc_package_id, title: r.title, nights_count: r.nights_count, destinationNames: names, hotels: r.package_hotels ?? [] }, profile)
    if (violations.length) summary.withViolations++
    await db.from('packages').update({
      destination_profile_code: profile.code,
      family: profile.family,
      is_cupo: isCupo,
      profile_violations: violations.length ? { violations, checked_at: now } : null,
    }).eq('id', r.id)
  }
  await log(`Auditoría de perfiles: ${summary.matched}/${summary.scanned} con perfil, ${summary.withViolations} con observaciones, ${summary.unmatched.length} sin perfil`, { unmatched: summary.unmatched.slice(0, 30) }, summary.unmatched.length ? 'warning' : 'info')
  return summary
}
