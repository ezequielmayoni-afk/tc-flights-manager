import { NextRequest, NextResponse } from 'next/server'
import { listPackageCreatives } from '@/lib/google-drive/client'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/creatives/sync-count
 *
 * Sync creative_count with actual Google Drive files
 * Body: { packageId?: number } - If not provided, syncs all packages
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json().catch(() => ({}))
    const { packageId } = body

    if (packageId) {
      // Sync single package
      const result = await syncPackageCount(db, packageId)
      return NextResponse.json(result)
    }

    // Sync all packages with tc_package_id
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id')
      .not('tc_package_id', 'is', null)

    if (fetchError) {
      throw fetchError
    }

    const results: Array<{ id: number; tc_package_id: number; count: number; synced: boolean }> = []

    for (const pkg of packages || []) {
      try {
        const result = await syncPackageCount(db, pkg.id)
        results.push({ ...pkg, count: result.count, synced: true })
      } catch (error) {
        console.error(`[Sync] Error syncing package ${pkg.id}:`, error)
        results.push({ ...pkg, count: 0, synced: false })
      }
    }

    const syncedCount = results.filter(r => r.synced).length
    console.log(`[Sync] Synced ${syncedCount}/${results.length} packages`)

    return NextResponse.json({
      success: true,
      synced: syncedCount,
      total: results.length,
      results,
    })

  } catch (error) {
    console.error('[Sync] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Sync failed' },
      { status: 500 }
    )
  }
}

async function syncPackageCount(
  db: ReturnType<typeof getSupabaseClient>,
  packageId: number
): Promise<{ count: number; updated: boolean }> {
  // Get tc_package_id
  const { data: pkg, error: pkgError } = await db
    .from('packages')
    .select('tc_package_id')
    .eq('id', packageId)
    .single()

  if (pkgError || !pkg?.tc_package_id) {
    return { count: 0, updated: false }
  }

  // Count actual files in Google Drive
  const result = await listPackageCreatives(pkg.tc_package_id)
  const actualCount = result.creatives.length

  // Update the count using RPC function
  const { error: updateError } = await db.rpc('set_creative_count', {
    package_id_param: packageId,
    count_param: actualCount,
  })

  if (updateError) {
    // Fallback to direct update if RPC doesn't exist yet
    await db
      .from('packages')
      .update({ creative_count: actualCount })
      .eq('id', packageId)
  }

  console.log(`[Sync] Package ${packageId}: count set to ${actualCount}`)

  return { count: actualCount, updated: true }
}
