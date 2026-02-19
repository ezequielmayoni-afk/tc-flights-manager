import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { id } = await params
    const packageId = parseInt(id, 10)

    if (isNaN(packageId)) {
      return NextResponse.json({ error: 'Invalid package ID' }, { status: 400 })
    }

    const { design_deadline } = await request.json()

    const db = createAdminClient()
    const { error } = await db
      .from('packages')
      .update({ design_deadline: design_deadline || null })
      .eq('id', packageId)

    if (error) {
      console.error('[Deadline] Update error:', error)
      return errorResponse(error)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Deadline] Error:', error)
    return errorResponse(error)
  }
}
