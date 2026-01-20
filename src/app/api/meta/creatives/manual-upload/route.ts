import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/meta/creatives/manual-upload
 * Manually upload an image or video to Meta from a local file
 *
 * FormData:
 *   - file: File (image or video)
 *   - package_id: number
 *   - tc_package_id: number
 *   - variant: number (1-5)
 *   - aspect_ratio: '4x5' | '9x16'
 *   - creative_type: 'IMAGE' | 'VIDEO'
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const packageId = formData.get('package_id') as string
    const tcPackageId = formData.get('tc_package_id') as string
    const variant = formData.get('variant') as string
    const aspectRatio = formData.get('aspect_ratio') as '4x5' | '9x16'
    const creativeType = formData.get('creative_type') as 'IMAGE' | 'VIDEO'

    // Validate inputs
    if (!file) {
      return new Response(JSON.stringify({ error: 'No se recibió archivo' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!packageId || !tcPackageId || !variant || !aspectRatio || !creativeType) {
      return new Response(JSON.stringify({ error: 'Faltan parámetros requeridos' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const variantNum = parseInt(variant, 10)
    if (variantNum < 1 || variantNum > 5) {
      return new Response(JSON.stringify({ error: 'Variante debe ser entre 1 y 5' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    if (!['4x5', '9x16'].includes(aspectRatio)) {
      return new Response(JSON.stringify({ error: 'aspect_ratio debe ser 4x5 o 9x16' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[Manual Upload] Starting upload for V${variant} ${aspectRatio} (${creativeType})`)

    // Convert File to Buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log(`[Manual Upload] File size: ${buffer.length} bytes, type: ${file.type}`)

    // Upload to Meta
    const metaClient = getMetaAdsClient()
    let metaHash: string | undefined
    let metaVideoId: string | undefined

    if (creativeType === 'IMAGE') {
      console.log(`[Manual Upload] Uploading image to Meta...`)
      metaHash = await metaClient.uploadImage(buffer, file.name)
      console.log(`[Manual Upload] Image uploaded, hash: ${metaHash}`)
    } else {
      console.log(`[Manual Upload] Uploading video to Meta...`)
      metaVideoId = await metaClient.uploadVideo(buffer, file.name)
      console.log(`[Manual Upload] Video uploaded, ID: ${metaVideoId}`)
    }

    // Save to database
    const { error: dbError } = await db.from('meta_creatives').upsert(
      {
        package_id: parseInt(packageId, 10),
        tc_package_id: parseInt(tcPackageId, 10),
        variant: variantNum,
        aspect_ratio: aspectRatio,
        drive_file_id: `manual_${Date.now()}`, // Mark as manual upload
        meta_image_hash: metaHash || null,
        meta_video_id: metaVideoId || null,
        creative_type: creativeType,
        upload_status: 'uploaded',
        uploaded_at: new Date().toISOString(),
      },
      { onConflict: 'package_id,variant,aspect_ratio' }
    )

    if (dbError) {
      console.error(`[Manual Upload] Database error:`, dbError)
      throw new Error('Error guardando en base de datos')
    }

    console.log(`[Manual Upload] Successfully uploaded V${variant} ${aspectRatio}`)

    return new Response(
      JSON.stringify({
        success: true,
        variant: variantNum,
        aspectRatio,
        creativeType,
        metaHash,
        metaVideoId,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Manual Upload] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error subiendo archivo' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
