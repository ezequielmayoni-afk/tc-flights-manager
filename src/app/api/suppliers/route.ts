import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/suppliers
 * Get all suppliers from the database
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const db = createAdminClient()

    const { data: suppliers, error } = await db
      .from('suppliers')
      .select('id, name')
      .order('name')

    if (error) {
      throw error
    }

    return NextResponse.json({ suppliers: suppliers || [] })
  } catch (error) {
    console.error('[Suppliers GET] Error:', error)
    return errorResponse(error)
  }
}
