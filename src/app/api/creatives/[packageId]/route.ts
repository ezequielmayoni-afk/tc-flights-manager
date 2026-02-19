import { NextRequest, NextResponse } from 'next/server'
import { listPackageCreatives, deleteCreative } from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { packageId } = await params
    const id = parseInt(packageId, 10)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid package ID' }, { status: 400 })
    }

    // Get the tc_package_id from database
    const db = createAdminClient()
    const { data: pkg, error: dbError } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', id)
      .single()

    if (dbError || !pkg) {
      return NextResponse.json({ creatives: [], folders: { packageFolderId: null, variantFolders: {} } })
    }

    const result = await listPackageCreatives(pkg.tc_package_id)

    return NextResponse.json({
      creatives: result.creatives,
      folders: result.folders,
    })
  } catch (error) {
    console.error('[Creatives] List error:', error)
    return errorResponse(error)
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { packageId } = await params
    const id = parseInt(packageId, 10)
    const { fileId } = await request.json()

    if (!fileId) {
      return NextResponse.json({ error: 'Missing fileId' }, { status: 400 })
    }

    await deleteCreative(fileId)

    // Decrement creative_count atomically
    if (!isNaN(id)) {
      const db = createAdminClient()
      const { error: rpcError } = await db.rpc('decrement_creative_count', {
        package_id_param: id,
      })

      if (rpcError) {
        // Fallback to direct update if RPC doesn't exist
        const { data: pkg } = await db
          .from('packages')
          .select('creative_count')
          .eq('id', id)
          .single()

        if (pkg && pkg.creative_count > 0) {
          await db
            .from('packages')
            .update({ creative_count: pkg.creative_count - 1 })
            .eq('id', id)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Creatives] Delete error:', error)
    return errorResponse(error)
  }
}
