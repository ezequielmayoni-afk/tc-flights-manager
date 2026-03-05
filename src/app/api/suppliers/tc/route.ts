import { NextResponse } from 'next/server'
import { listSuppliers } from '@/lib/travelcompositor/client'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/suppliers/tc
 * Fetch all active suppliers directly from TravelCompositor API
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const suppliers = await listSuppliers()
    return NextResponse.json({ suppliers })
  } catch (error) {
    console.error('[Suppliers TC] Error:', error)
    return errorResponse(error)
  }
}
