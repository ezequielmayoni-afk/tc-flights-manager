import { NextRequest, NextResponse } from 'next/server'
import {
  getOrCreatePackageFolder,
  getOrCreateVariantFolder,
  createResumableUploadSession,
  AspectRatio,
} from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'

/**
 * POST /api/creatives/upload-session
 * Creates a resumable upload session URL for direct browser-to-Drive upload.
 * This avoids Next.js body size limits by having the browser upload directly to Google Drive.
 *
 * Body: { packageId, variant, aspectRatio, mimeType, fileName }
 * Returns: { uploadUrl, fileName, fileId? }
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const { packageId, variant, aspectRatio, mimeType, fileName } = await request.json()

    if (!packageId || !variant || !aspectRatio || !mimeType) {
      return NextResponse.json(
        { error: 'Missing required fields: packageId, variant, aspectRatio, mimeType' },
        { status: 400 }
      )
    }

    if (!['4x5', '9x16'].includes(aspectRatio)) {
      return NextResponse.json(
        { error: 'Invalid aspectRatio. Must be "4x5" or "9x16"' },
        { status: 400 }
      )
    }

    // Get tc_package_id from database
    const db = createAdminClient()
    const { data: pkg, error: dbError } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', packageId)
      .single()

    if (dbError || !pkg) {
      return NextResponse.json({ error: 'Package not found' }, { status: 404 })
    }

    // Create/get folders
    const packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)
    const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variant)

    // Create resumable upload session (deletes existing file, returns upload URL)
    const session = await createResumableUploadSession(
      variantFolderId,
      aspectRatio as AspectRatio,
      mimeType,
      fileName
    )

    return NextResponse.json({
      uploadUrl: session.uploadUrl,
      fileName: session.fileName,
      packageId,
      variant,
      aspectRatio,
    })
  } catch (error) {
    console.error('[Upload Session] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
