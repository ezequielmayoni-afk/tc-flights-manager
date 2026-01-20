import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { getPackageCreatives, type DriveCreativeInfo } from '@/lib/meta-ads/creative-uploader'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/creatives/[packageId]
 * Get creatives for a specific package from both Drive and database
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const db = getSupabaseClient()
  const { packageId } = await params

  try {
    // First get the package to get tc_package_id
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', parseInt(packageId, 10))
      .single()

    if (pkgError || !pkg) {
      return NextResponse.json({ creatives: [] })
    }

    // Get creatives from database (already uploaded to Meta)
    const { data: dbCreatives } = await db
      .from('meta_creatives')
      .select('*')
      .eq('package_id', parseInt(packageId, 10))
      .order('variant')
      .order('aspect_ratio')

    // Get creatives from Google Drive
    let driveCreatives: DriveCreativeInfo[] = []
    let driveError: string | null = null
    try {
      console.log(`[Meta Creatives GET] Fetching from Drive for tc_package_id: ${pkg.tc_package_id}`)
      driveCreatives = await getPackageCreatives(pkg.tc_package_id)
      console.log(`[Meta Creatives GET] Found ${driveCreatives.length} creatives in Drive`)
    } catch (err) {
      driveError = err instanceof Error ? err.message : 'Unknown Drive error'
      console.error('[Meta Creatives GET] Error fetching from Drive:', err)
      // Continue with DB creatives only
    }

    // Build a map of Drive creatives for quick lookup
    const driveCreativesMap = new Map<string, DriveCreativeInfo>()
    for (const dc of driveCreatives) {
      const key = `${dc.variant}-${dc.aspectRatio}`
      driveCreativesMap.set(key, dc)
    }

    // Merge: use DB data if available (has upload status), otherwise use Drive data
    // Also detect changes: compare drive_file_id from Drive vs what's in DB
    const creativesMap = new Map<string, {
      id?: number
      variant: number
      aspect_ratio: string
      creative_type: string
      drive_file_id: string
      drive_file_id_current: string  // Current file ID in Drive
      upload_status: string
      meta_image_hash?: string
      meta_video_id?: string
      has_changes: boolean  // True if Drive file is different from what was uploaded
      is_new: boolean  // True if creative exists in Drive but not in DB (never uploaded)
    }>()

    // Add Drive creatives first (as pending/new)
    for (const dc of driveCreatives) {
      const key = `${dc.variant}-${dc.aspectRatio}`
      creativesMap.set(key, {
        variant: dc.variant,
        aspect_ratio: dc.aspectRatio,
        creative_type: dc.creativeType,
        drive_file_id: dc.fileId,
        drive_file_id_current: dc.fileId,
        upload_status: 'pending',
        has_changes: false,
        is_new: true,  // Will be set to false if found in DB
      })
    }

    // Override with DB creatives (have actual upload status)
    // Detect changes by comparing drive_file_id
    for (const dbc of (dbCreatives || [])) {
      const key = `${dbc.variant}-${dbc.aspect_ratio}`
      const driveCreative = driveCreativesMap.get(key)
      const currentDriveFileId = driveCreative?.fileId || ''

      // Detect if the file in Drive is different from what we uploaded
      const hasChanges = dbc.drive_file_id && currentDriveFileId &&
                         dbc.drive_file_id !== currentDriveFileId

      creativesMap.set(key, {
        id: dbc.id,
        variant: dbc.variant,
        aspect_ratio: dbc.aspect_ratio,
        creative_type: dbc.creative_type,
        drive_file_id: dbc.drive_file_id || currentDriveFileId || '',
        drive_file_id_current: currentDriveFileId,
        upload_status: dbc.upload_status,
        meta_image_hash: dbc.meta_image_hash,
        meta_video_id: dbc.meta_video_id,
        has_changes: hasChanges,
        is_new: false,
      })
    }

    // Convert map to sorted array
    const creatives = Array.from(creativesMap.values()).sort((a, b) => {
      if (a.variant !== b.variant) return a.variant - b.variant
      return a.aspect_ratio.localeCompare(b.aspect_ratio)
    })

    // Count changes
    const changedCount = creatives.filter(c => c.has_changes).length
    const newCount = creatives.filter(c => c.is_new).length

    return NextResponse.json({
      creatives,
      drive_error: driveError,
      tc_package_id: pkg.tc_package_id,
      changed_count: changedCount,
      new_count: newCount,
    })
  } catch (error) {
    console.error('[Meta Creatives GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching creatives' },
      { status: 500 }
    )
  }
}
