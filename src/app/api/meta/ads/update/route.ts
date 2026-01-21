import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'
import { getMetaAdsClient } from '@/lib/meta-ads/client'
import { getPackageCreatives, uploadCreativeToMeta } from '@/lib/meta-ads/creative-uploader'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Instagram user ID for the account - MUST be configured, no fallback to avoid wrong account
const INSTAGRAM_USER_ID = process.env.META_INSTAGRAM_USER_ID

function getInstagramUserId(): string {
  if (!INSTAGRAM_USER_ID) {
    throw new Error('META_INSTAGRAM_USER_ID no configurado - requerido para actualizar ads')
  }
  return INSTAGRAM_USER_ID
}

interface UpdateAdRequest {
  ad_id: number           // Database ID of the ad
  meta_ad_id: string      // Meta's ad ID
  package_id: number
  variant: number
  update_creative: boolean  // Whether to re-upload creative from Drive
  update_copy: boolean      // Whether to use latest copies
  force_reupload?: boolean  // Force re-upload from Drive even if already uploaded in DB
}

/**
 * POST /api/meta/ads/update
 * Update existing ads in Meta with new creatives and/or copies
 *
 * This endpoint:
 * 1. Gets new creatives from Google Drive
 * 2. Uploads them to Meta
 * 3. Creates a new AdCreative with the new images
 * 4. Updates the existing Ad to use the new creative
 *
 * Body: { package_id: number } (updates all ads for this package)
 *   OR: { ads: UpdateAdRequest[] } (legacy: updates specific ads)
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    let ads: UpdateAdRequest[]

    // Support simple package_id mode - automatically get all ads for the package
    if (body.package_id && !body.ads) {
      const { data: existingAds, error: adsError } = await db
        .from('meta_ads')
        .select('id, meta_ad_id, package_id, variant')
        .eq('package_id', body.package_id)
        .neq('status', 'DELETED')

      if (adsError || !existingAds || existingAds.length === 0) {
        return new Response(JSON.stringify({ error: 'No existing ads found for this package' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }

      // force_reupload defaults to true in package_id mode to always get fresh creatives
      const forceReupload = body.force_reupload !== false
      ads = existingAds.map(ad => ({
        ad_id: ad.id,
        meta_ad_id: ad.meta_ad_id,
        package_id: ad.package_id,
        variant: ad.variant,
        update_creative: true,
        update_copy: true,
        force_reupload: forceReupload,
      }))
    } else {
      ads = body.ads as UpdateAdRequest[]
    }

    if (!ads || !Array.isArray(ads) || ads.length === 0) {
      return new Response(JSON.stringify({ error: 'ads array is required' }), {
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

        const metaClient = getMetaAdsClient()
        let totalUpdated = 0
        let totalErrors = 0

        // Group ads by package for efficiency
        const adsByPackage = new Map<number, UpdateAdRequest[]>()
        for (const ad of ads) {
          const existing = adsByPackage.get(ad.package_id) || []
          existing.push(ad)
          adsByPackage.set(ad.package_id, existing)
        }

        for (const [package_id, packageAds] of adsByPackage) {
          try {
            // Get package info
            const { data: pkg, error: pkgError } = await db
              .from('packages')
              .select('tc_package_id, title')
              .eq('id', package_id)
              .single()

            if (pkgError || !pkg) {
              sendEvent('error', {
                package_id,
                error: 'Package not found',
              })
              totalErrors += packageAds.length
              continue
            }

            sendEvent('updating', {
              package_id,
              step: 'Fetching creatives from Drive',
            })

            // Get creatives from Drive for this package
            const driveCreatives = await getPackageCreatives(pkg.tc_package_id)
            console.log(`[Ads Update] Found ${driveCreatives.length} creatives in Drive for package ${pkg.tc_package_id}`)

            // Get all copies for this package
            const { data: copies } = await db
              .from('meta_ad_copies')
              .select('*')
              .eq('package_id', package_id)
              .order('variant', { ascending: true })

            if (!copies || copies.length === 0) {
              sendEvent('error', {
                package_id,
                error: 'No copies found for this package',
              })
              totalErrors += packageAds.length
              continue
            }

            // WhatsApp autofill message template
            const waMessageTemplate = `Hola! Quiero mas info de la promo SIV ${pkg.tc_package_id} (no borrar)`

            // Prepare copy variations
            const copyVariations = copies.map((copy) => ({
              primary_text: copy.primary_text,
              headline: copy.headline,
              description: copy.description || undefined,
            }))

            // Process each ad in this package
            for (const ad of packageAds) {
              try {
                sendEvent('updating', {
                  package_id,
                  variant: ad.variant,
                  step: `Processing ad V${ad.variant}`,
                })

                let imageHash4x5: string | undefined
                let imageHash9x16: string | undefined
                let videoId4x5: string | undefined
                let videoId9x16: string | undefined
                let isVideo = false

                // FIRST: Check database for already-uploaded creatives (from manual upload or previous uploads)
                // Skip if force_reupload is true - always get fresh from Drive
                const { data: existingCreatives } = await db
                  .from('meta_creatives')
                  .select('*')
                  .eq('package_id', package_id)
                  .eq('variant', ad.variant)
                  .eq('upload_status', 'uploaded')

                const existing4x5 = existingCreatives?.find(c => c.aspect_ratio === '4x5')
                const existing9x16 = existingCreatives?.find(c => c.aspect_ratio === '9x16')

                // If we have uploaded creatives in database AND not forcing reupload, use them directly
                if (!ad.force_reupload && existing4x5 && (existing4x5.meta_image_hash || existing4x5.meta_video_id)) {
                  sendEvent('updating', {
                    package_id,
                    variant: ad.variant,
                    step: `Using uploaded creative from database`,
                  })

                  isVideo = existing4x5.creative_type === 'VIDEO'

                  if (isVideo) {
                    videoId4x5 = existing4x5.meta_video_id
                  } else {
                    imageHash4x5 = existing4x5.meta_image_hash
                  }

                  if (existing9x16) {
                    if (existing9x16.creative_type === 'VIDEO') {
                      videoId9x16 = existing9x16.meta_video_id
                    } else {
                      imageHash9x16 = existing9x16.meta_image_hash
                    }
                  }

                  console.log(`[Ads Update] Using database creatives for V${ad.variant}: hash4x5=${imageHash4x5}, videoId4x5=${videoId4x5}`)
                }
                // SECOND: If no database creatives AND update_creative is true, try Drive
                else if (ad.update_creative) {
                  // Get creatives for this variant from Drive
                  const variantCreatives = driveCreatives.filter(c => c.variant === ad.variant)
                  const creative4x5 = variantCreatives.find(c => c.aspectRatio === '4x5')
                  const creative9x16 = variantCreatives.find(c => c.aspectRatio === '9x16')

                  if (!creative4x5) {
                    sendEvent('error', {
                      package_id,
                      variant: ad.variant,
                      error: `No 4x5 creative found in Drive or database for V${ad.variant}`,
                    })
                    totalErrors++
                    continue
                  }

                  isVideo = creative4x5.creativeType === 'VIDEO'

                  sendEvent('updating', {
                    package_id,
                    variant: ad.variant,
                    step: `Uploading 4x5 ${isVideo ? 'video' : 'image'} from Drive to Meta`,
                  })

                  // Upload 4x5 creative from Drive
                  const upload4x5 = await uploadCreativeToMeta(creative4x5)
                  if (!upload4x5.success) {
                    sendEvent('error', {
                      package_id,
                      variant: ad.variant,
                      error: `Failed to upload 4x5: ${upload4x5.error}`,
                    })
                    totalErrors++
                    continue
                  }

                  // Store either hash (image) or video ID
                  if (isVideo) {
                    videoId4x5 = upload4x5.metaVideoId
                  } else {
                    imageHash4x5 = upload4x5.metaHash
                  }

                  // Save uploaded creative to database
                  await db.from('meta_creatives').upsert({
                    package_id,
                    tc_package_id: pkg.tc_package_id,
                    variant: ad.variant,
                    aspect_ratio: '4x5',
                    drive_file_id: creative4x5.fileId,
                    meta_image_hash: imageHash4x5 || null,
                    meta_video_id: videoId4x5 || null,
                    creative_type: creative4x5.creativeType,
                    upload_status: 'uploaded',
                    uploaded_at: new Date().toISOString(),
                  }, { onConflict: 'package_id,variant,aspect_ratio' })

                  // Upload 9x16 if available
                  if (creative9x16) {
                    sendEvent('updating', {
                      package_id,
                      variant: ad.variant,
                      step: `Uploading 9x16 ${creative9x16.creativeType === 'VIDEO' ? 'video' : 'image'} to Meta`,
                    })

                    const upload9x16 = await uploadCreativeToMeta(creative9x16)
                    if (upload9x16.success) {
                      if (creative9x16.creativeType === 'VIDEO') {
                        videoId9x16 = upload9x16.metaVideoId
                      } else {
                        imageHash9x16 = upload9x16.metaHash
                      }

                      await db.from('meta_creatives').upsert({
                        package_id,
                        tc_package_id: pkg.tc_package_id,
                        variant: ad.variant,
                        aspect_ratio: '9x16',
                        drive_file_id: creative9x16.fileId,
                        meta_image_hash: imageHash9x16 || null,
                        meta_video_id: videoId9x16 || null,
                        creative_type: creative9x16.creativeType,
                        upload_status: 'uploaded',
                        uploaded_at: new Date().toISOString(),
                      }, { onConflict: 'package_id,variant,aspect_ratio' })
                    }
                  }
                } else {
                  // No creatives in database and update_creative is false
                  sendEvent('error', {
                    package_id,
                    variant: ad.variant,
                    error: 'No uploaded 4x5 creative found in database',
                  })
                  totalErrors++
                  continue
                }

                // Verify we have the required creative
                if (!imageHash4x5 && !videoId4x5) {
                  sendEvent('error', {
                    package_id,
                    variant: ad.variant,
                    error: 'No valid 4x5 creative hash or video ID available',
                  })
                  totalErrors++
                  continue
                }

                sendEvent('updating', {
                  package_id,
                  variant: ad.variant,
                  step: `Creating new ad creative in Meta (${isVideo ? 'VIDEO' : 'IMAGE'})`,
                })

                // Create new AdCreative with updated images/videos and copies
                const adCreativeName = `${pkg.title} - ${pkg.tc_package_id} - V${ad.variant} (Updated ${new Date().toISOString().split('T')[0]})`

                const metaCreativeId = await metaClient.createWhatsAppAdCreative({
                  name: adCreativeName,
                  // Image parameters (only passed if we have images)
                  imageHash4x5: imageHash4x5,
                  imageHash9x16: imageHash9x16,
                  // Video parameters (only passed if we have videos)
                  videoId4x5: videoId4x5,
                  videoId9x16: videoId9x16,
                  copies: copyVariations,
                  waMessageTemplate,
                  tcPackageId: pkg.tc_package_id,
                  instagramUserId: getInstagramUserId(),
                })

                sendEvent('updating', {
                  package_id,
                  variant: ad.variant,
                  step: `New creative created (${metaCreativeId}), updating ad`,
                })

                // Update the existing Ad to use the new creative
                await metaClient.updateAdCreative(ad.meta_ad_id, metaCreativeId)

                // Update database record
                await db
                  .from('meta_ads')
                  .update({
                    meta_creative_id: metaCreativeId,
                    status: 'ACTIVE',
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', ad.ad_id)

                totalUpdated++
                sendEvent('updated', {
                  package_id,
                  variant: ad.variant,
                  meta_ad_id: ad.meta_ad_id,
                  new_creative_id: metaCreativeId,
                })

                // Small delay between updates
                await new Promise((resolve) => setTimeout(resolve, 500))
              } catch (error) {
                console.error(`[Ads Update] Error updating ad ${ad.meta_ad_id}:`, error)
                totalErrors++
                sendEvent('error', {
                  package_id,
                  variant: ad.variant,
                  meta_ad_id: ad.meta_ad_id,
                  error: error instanceof Error ? error.message : 'Unknown error',
                })
              }
            }
          } catch (error) {
            console.error(`[Ads Update] Error processing package ${package_id}:`, error)
            totalErrors += packageAds.length
            sendEvent('error', {
              package_id,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        sendEvent('complete', {
          updated: totalUpdated,
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
    console.error('[Ads Update POST] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating ads' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
