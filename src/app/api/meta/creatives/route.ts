import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import {
  uploadPackageCreativesToMeta,
  getPackageCreatives,
} from '@/lib/meta-ads/creative-uploader'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/creatives?package_id=XXX
 * Get creatives status for a package
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const packageId = request.nextUrl.searchParams.get('package_id')

  if (!packageId) {
    return new Response(JSON.stringify({ error: 'package_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    // Get package to get tc_package_id
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('tc_package_id')
      .eq('id', packageId)
      .single()

    if (pkgError || !pkg) {
      throw new Error('Package not found')
    }

    // Get creatives from Drive
    const driveCreatives = await getPackageCreatives(pkg.tc_package_id)

    // Get uploaded creatives from DB
    const { data: uploadedCreatives } = await db
      .from('meta_creatives')
      .select('*')
      .eq('package_id', parseInt(packageId))

    return new Response(
      JSON.stringify({
        drive_creatives: driveCreatives,
        uploaded_creatives: uploadedCreatives || [],
      }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[Meta Creatives GET] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error fetching creatives' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /api/meta/creatives
 * Upload creatives from Drive to Meta (SSE stream)
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { packageIds, variants } = body as {
      packageIds: number[]
      variants?: number[]
    }

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return new Response(JSON.stringify({ error: 'packageIds is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
        }

        let totalUploaded = 0
        let totalErrors = 0

        for (const packageId of packageIds) {
          try {
            // Get package info
            const { data: pkg, error: pkgError } = await db
              .from('packages')
              .select('tc_package_id, title')
              .eq('id', packageId)
              .single()

            if (pkgError || !pkg) {
              sendEvent('error', {
                package_id: packageId,
                error: 'Package not found',
              })
              totalErrors++
              continue
            }

            sendEvent('progress', {
              package_id: packageId,
              status: 'starting',
              message: `Uploading creatives for ${pkg.title}`,
            })

            // Upload creatives
            const results = await uploadPackageCreativesToMeta(pkg.tc_package_id, variants)

            // Save results to database
            for (const result of results) {
              if (result.success) {
                await db.from('meta_creatives').upsert(
                  {
                    package_id: packageId,
                    tc_package_id: pkg.tc_package_id,
                    variant: result.variant,
                    aspect_ratio: result.aspectRatio,
                    drive_file_id: result.driveFileId || '',
                    meta_image_hash: result.metaHash || null,
                    meta_video_id: result.metaVideoId || null,
                    creative_type: result.creativeType,
                    upload_status: 'uploaded',
                    uploaded_at: new Date().toISOString(),
                  },
                  { onConflict: 'package_id,variant,aspect_ratio' }
                )

                totalUploaded++
                sendEvent('progress', {
                  package_id: packageId,
                  variant: result.variant,
                  aspect_ratio: result.aspectRatio,
                  status: 'uploaded',
                  meta_hash: result.metaHash,
                  meta_video_id: result.metaVideoId,
                  drive_file_id: result.driveFileId,
                })
              } else {
                await db.from('meta_creatives').upsert(
                  {
                    package_id: packageId,
                    tc_package_id: pkg.tc_package_id,
                    variant: result.variant,
                    aspect_ratio: result.aspectRatio,
                    drive_file_id: result.driveFileId || '',
                    creative_type: result.creativeType,
                    upload_status: 'error',
                    upload_error: result.error,
                  },
                  { onConflict: 'package_id,variant,aspect_ratio' }
                )

                totalErrors++
                sendEvent('error', {
                  package_id: packageId,
                  variant: result.variant,
                  aspect_ratio: result.aspectRatio,
                  error: result.error,
                })
              }
            }
          } catch (error) {
            console.error(`[Meta Creatives] Error for package ${packageId}:`, error)
            sendEvent('error', {
              package_id: packageId,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
            totalErrors++
          }
        }

        sendEvent('complete', {
          uploaded: totalUploaded,
          errors: totalErrors,
        })

        controller.close()
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  } catch (error) {
    console.error('[Meta Creatives POST] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error uploading creatives' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
