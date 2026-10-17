import { NextRequest, NextResponse } from 'next/server'
import { checkSectionAccess } from '@/lib/auth'
import { API_ERRORS, errorResponse } from '@/lib/api/errors'
import { createAdminClient } from '@/lib/supabase/admin'
import { loadPackagePerformance } from '@/lib/crm/performance'

export const dynamic = 'force-dynamic'

/** GET /api/rendimiento/paquetes?from&to&userId&teamId — rango obligatorio (regla de Ezequiel: todo con filtro de fecha). */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('rendimiento')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  try {
    const sp = request.nextUrl.searchParams
    const from = sp.get('from'); const to = sp.get('to')
    if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) throw API_ERRORS.BAD_REQUEST('from y to (YYYY-MM-DD) son obligatorios')
    if (Date.parse(to) - Date.parse(from) > 185 * 86400000) throw API_ERRORS.BAD_REQUEST('Rango máximo: 6 meses')
    const db = createAdminClient()
    const data = await loadPackagePerformance(db, { from, to, userId: sp.get('userId'), teamId: sp.get('teamId') })
    const [{ data: users }, { data: teams }, { data: wm }] = await Promise.all([
      db.from('crm_contact_attributions').select('assigned_user_id, assigned_user_name').not('assigned_user_id', 'is', null).gte('siv_first_at', `${from}T00:00:00Z`).lte('siv_first_at', `${to}T23:59:59Z`),
      db.from('crm_contact_attributions').select('assigned_team_id, assigned_team_name').not('assigned_team_id', 'is', null).gte('siv_first_at', `${from}T00:00:00Z`).lte('siv_first_at', `${to}T23:59:59Z`),
      db.from('crm_rollup_watermarks').select('value, updated_at').eq('key', 'crm.rollup').maybeSingle(),
    ])
    const uniq = <T extends { id: string; name: string }>(list: T[]) => [...new Map(list.map(x => [x.id, x])).values()].sort((a, b) => a.name.localeCompare(b.name))
    return NextResponse.json({ ...data, users: uniq((users ?? []).map(u => ({ id: String(u.assigned_user_id), name: String(u.assigned_user_name ?? u.assigned_user_id) }))), teams: uniq((teams ?? []).map(t => ({ id: String(t.assigned_team_id), name: String(t.assigned_team_name ?? t.assigned_team_id) }))), lastRollupAt: wm?.updated_at ?? null })
  } catch (error) {
    return errorResponse(error)
  }
}
