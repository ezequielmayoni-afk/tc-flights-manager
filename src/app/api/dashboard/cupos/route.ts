import { NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadFlightsForMatch } from '@/lib/packages/flight-match'
import { buildCupoSummary, type CupoSummaryRow, type LinkedPackageInfo } from '@/lib/cupos/summary'

export const dynamic = 'force-dynamic'

export interface CuposSummaryResponse {
  rows: CupoSummaryRow[]
  today: string
}

/** GET /api/dashboard/cupos — cupos por salida (idas activas con fecha futura), con destino, región y lugares. */
export async function GET() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const db = createAdminClient()
    const today = new Date().toISOString().slice(0, 10)
    const flights = await loadFlightsForMatch(db, { activeOnly: true })
    const ids = flights.map(f => f.id)
    const [{ data: links }, { data: profiles }] = await Promise.all([
      ids.length ? db.from('flight_package_links').select('flight_id, package_id, rejected').in('flight_id', ids) : Promise.resolve({ data: [] as Array<{ flight_id: number; package_id: number; rejected: boolean | null }> }),
      db.from('destination_profiles').select('name, family, iata_airport'),
    ])
    const linkedPackagesByFlight = new Map<number, number[]>()
    for (const l of (links ?? []) as Array<{ flight_id: number; package_id: number; rejected: boolean | null }>) {
      if (l.rejected) continue
      if (!linkedPackagesByFlight.has(l.flight_id)) linkedPackagesByFlight.set(l.flight_id, [])
      linkedPackagesByFlight.get(l.flight_id)!.push(l.package_id)
    }
    const packageIds = [...new Set([...linkedPackagesByFlight.values()].flat())]
    const destinationsByPackage = new Map<number, string[]>()
    const packagesById = new Map<number, LinkedPackageInfo>()
    if (packageIds.length) {
      const [{ data: dests }, { data: pkgs }] = await Promise.all([
        db.from('package_destinations').select('package_id, destination_name, sort_order').in('package_id', packageIds).order('sort_order'),
        db.from('packages').select('id, tc_package_id, title, status, send_to_marketing, send_to_design, date_range_end, tc_active').in('id', packageIds),
      ])
      for (const d of (dests ?? []) as Array<{ package_id: number; destination_name: string | null; sort_order: number | null }>) {
        if (!d.destination_name) continue
        if (!destinationsByPackage.has(d.package_id)) destinationsByPackage.set(d.package_id, [])
        destinationsByPackage.get(d.package_id)!.push(d.destination_name)
      }
      for (const p of (pkgs ?? []) as LinkedPackageInfo[]) packagesById.set(p.id, p)
    }
    const rows = buildCupoSummary({ flights, linkedPackagesByFlight, destinationsByPackage, packagesById, profiles: (profiles ?? []) as Array<{ name: string; family: string | null; iata_airport: string | null }>, today })
    return NextResponse.json({ rows, today } satisfies CuposSummaryResponse)
  } catch (error) {
    return errorResponse(error)
  }
}
