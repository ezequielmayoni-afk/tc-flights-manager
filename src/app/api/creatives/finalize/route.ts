import { NextRequest, NextResponse } from 'next/server'
import { finalizeUpload } from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/creatives/finalize
 * Called after browser finishes uploading to Google Drive.
 * Sets file permissions and increments creative_count.
 *
 * Body: { fileId, packageId }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { fileId, packageId } = await request.json()

    if (!fileId || !packageId) {
      return NextResponse.json(
        { error: 'Missing required fields: fileId, packageId' },
        { status: 400 }
      )
    }

    // Set permissions and get webViewLink
    const result = await finalizeUpload(fileId)

    // Increment creative_count
    const db = createAdminClient()
    const { error: rpcError } = await db.rpc('increment_creative_count', {
      package_id_param: packageId,
    })

    if (rpcError) {
      const { data: currentPkg } = await db
        .from('packages')
        .select('creative_count')
        .eq('id', packageId)
        .single()

      await db
        .from('packages')
        .update({ creative_count: (currentPkg?.creative_count || 0) + 1 })
        .eq('id', packageId)
    }

    return NextResponse.json({
      success: true,
      fileId: result.id,
      webViewLink: result.webViewLink,
    })
  } catch (error) {
    console.error('[Finalize] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
