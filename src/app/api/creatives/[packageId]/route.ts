import { NextRequest, NextResponse } from 'next/server'
import { listPackageCreatives, deleteCreative } from '@/lib/google-drive/client'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  try {
    const { packageId } = await params
    const id = parseInt(packageId, 10)

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Invalid package ID' }, { status: 400 })
    }

    // Get the tc_package_id from database
    const db = getSupabaseClient()
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list creatives' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
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
      const db = getSupabaseClient()
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete creative' },
      { status: 500 }
    )
  }
}
