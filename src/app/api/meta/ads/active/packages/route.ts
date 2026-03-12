import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * GET /api/meta/ads/active/packages
 * Returns all marketing packages (id, tc_package_id, title) for linking ads
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  const { data: packages, error } = await db
    .from('packages')
    .select('id, tc_package_id, title')
    .eq('send_to_marketing', true)
    .order('tc_package_id', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ packages: packages || [] })
}
