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
    throw new Error('META_INSTAGRAM_USER_ID no configurado - requerido para crear ads')
  }
  return INSTAGRAM_USER_ID
}

/**
 * POST /api/meta/ads
 * Create ads in Meta (SSE stream for progress)
 *
 * Logic:
 * - For each creative variant (V1, V2, V3...), create 1 Ad
 * - Each Ad uses placement asset customization (4x5 for feed, 9x16 for stories)
 * - All 5 copies are included in each ad
 * - WhatsApp message template is set from wa_message_template
 * - Ads are created in the EXISTING AdSet (no new AdSets created)
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { packages, campaign_id } = body as {
      packages: Array<{
        package_id: number
        meta_adset_id: string // AdSet to create ads in
        variants?: number[] // Optional: specific variants to create (1-5). If not provided, creates all available.
      }>
      campaign_id?: string
    }

    if (!packages || !Array.isArray(packages) || packages.length === 0) {
      return new Response(JSON.stringify({ error: 'packages array is required' }), {
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
        let totalCreated = 0
        let totalErrors = 0

        for (const pkgConfig of packages) {
          const { package_id, meta_adset_id, variants: requestedVariants } = pkgConfig

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
              totalErrors++
              continue
            }

            sendEvent('creating', {
              package_id,
              step: 'Fetching copies and creatives',
            })

            // Get ALL copies for this package (should be 5)
            const { data: copies, error: copiesError } = await db
              .from('meta_ad_copies')
              .select('*')
              .eq('package_id', package_id)
              .order('variant', { ascending: true })

            if (copiesError || !copies || copies.length === 0) {
              sendEvent('error', {
                package_id,
                error: 'No copies found for this package',
              })
              totalErrors++
              continue
            }

            // Get ALL uploaded creatives for this package from database
            let { data: creatives, error: creativesError } = await db
              .from('meta_creatives')
              .select('*')
              .eq('package_id', package_id)
              .eq('upload_status', 'uploaded')
              .order('variant', { ascending: true })

            console.log(`[Meta Ads] Found ${creatives?.length || 0} creatives in DB for package ${package_id}:`, creatives?.map(c => `V${c.variant} ${c.aspect_ratio} (type=${c.creative_type}, hash=${c.meta_image_hash || 'null'}, video=${c.meta_video_id || 'null'})`))

            // Check for new/changed creatives in Drive and re-upload if needed
            sendEvent('creating', {
              package_id,
              step: 'Checking for updated creatives in Drive...',
            })

            try {
              const driveCreatives = await getPackageCreatives(pkg.tc_package_id)
              console.log(`[Meta Ads] Found ${driveCreatives.length} creatives in Drive for package ${pkg.tc_package_id}:`, driveCreatives.map(c => `V${c.variant} ${c.aspectRatio} (${c.creativeType})`))

              // Filter to only requested variants if specified
              const variantsToCheck = requestedVariants && requestedVariants.length > 0
                ? driveCreatives.filter(dc => requestedVariants.includes(dc.variant))
                : driveCreatives

              // Check each Drive creative against the database
              for (const driveCreative of variantsToCheck) {
                const dbCreative = creatives?.find(
                  c => c.variant === driveCreative.variant && c.aspect_ratio === driveCreative.aspectRatio
                )

                // Re-upload if: no DB record, empty drive_file_id, or drive_file_id changed
                const needsReupload = !dbCreative ||
                  !dbCreative.drive_file_id ||
                  dbCreative.drive_file_id !== driveCreative.fileId

                if (needsReupload) {
                  sendEvent('creating', {
                    package_id,
                    step: `Re-uploading V${driveCreative.variant} ${driveCreative.aspectRatio} to Meta (file changed)...`,
                  })

                  const uploadResult = await uploadCreativeToMeta(driveCreative)

                  if (uploadResult.success) {
                    // Update or insert the creative in the database
                    await db.from('meta_creatives').upsert(
                      {
                        package_id,
                        tc_package_id: pkg.tc_package_id,
                        variant: uploadResult.variant,
                        aspect_ratio: uploadResult.aspectRatio,
                        drive_file_id: uploadResult.driveFileId || '',
                        meta_image_hash: uploadResult.metaHash || null,
                        meta_video_id: uploadResult.metaVideoId || null,
                        creative_type: uploadResult.creativeType,
                        upload_status: 'uploaded',
                        uploaded_at: new Date().toISOString(),
                      },
                      { onConflict: 'package_id,variant,aspect_ratio' }
                    )

                    sendEvent('creating', {
                      package_id,
                      step: `V${driveCreative.variant} ${driveCreative.aspectRatio} re-uploaded successfully`,
                    })
                  } else {
                    console.error(`[Meta Ads] Failed to re-upload creative V${driveCreative.variant} ${driveCreative.aspectRatio}:`, uploadResult.error)
                  }

                  // Small delay between uploads
                  await new Promise(resolve => setTimeout(resolve, 500))
                }
              }

              // Re-fetch creatives after potential re-uploads
              const refreshed = await db
                .from('meta_creatives')
                .select('*')
                .eq('package_id', package_id)
                .eq('upload_status', 'uploaded')
                .order('variant', { ascending: true })

              creatives = refreshed.data
              creativesError = refreshed.error
            } catch (driveError) {
              console.error('[Meta Ads] Error checking Drive creatives:', driveError)
              // Continue with existing creatives from DB
            }

            if (creativesError || !creatives || creatives.length === 0) {
              sendEvent('error', {
                package_id,
                error: 'No uploaded creatives found for this package',
              })
              totalErrors++
              continue
            }

            // Group creatives by variant, keeping both 4x5 and 9x16
            const creativesByVariant = new Map<number, {
              variant: number
              creative4x5?: typeof creatives[0]
              creative9x16?: typeof creatives[0]
            }>()

            for (const creative of creatives) {
              const existing = creativesByVariant.get(creative.variant) || {
                variant: creative.variant,
                creative4x5: undefined as typeof creatives[0] | undefined,
                creative9x16: undefined as typeof creatives[0] | undefined,
              }
              if (creative.aspect_ratio === '4x5') {
                existing.creative4x5 = creative
              } else if (creative.aspect_ratio === '9x16') {
                existing.creative9x16 = creative
              }
              creativesByVariant.set(creative.variant, existing)
            }

            // Get unique variants that have at least a 4x5 creative
            let uniqueVariants = Array.from(creativesByVariant.keys())
              .filter(v => creativesByVariant.get(v)?.creative4x5)
              .sort((a, b) => a - b)

            // Filter to only requested variants if specified
            if (requestedVariants && requestedVariants.length > 0) {
              uniqueVariants = uniqueVariants.filter(v => requestedVariants.includes(v))
            }

            if (uniqueVariants.length === 0) {
              sendEvent('error', {
                package_id,
                error: 'No 4x5 creatives found (required for feed placements)',
              })
              totalErrors++
              continue
            }

            sendEvent('creating', {
              package_id,
              step: `Found ${uniqueVariants.length} creative variant(s), creating ${uniqueVariants.length} ad(s) with ${copies.length} copies each`,
            })

            // WhatsApp autofill message template
            const waMessageTemplate = `Hola! Quiero mas info de la promo SIV ${pkg.tc_package_id} (no borrar)`

            // Prepare copy variations for all ads - KEEP emojis (they work fine with Meta API)
            const copyVariations = copies.map((copy) => ({
              primary_text: copy.primary_text,
              headline: copy.headline,
              description: copy.description || undefined,
            }))

            // Get campaign ID from AdSet if not provided
            let targetCampaignId = campaign_id
            if (!targetCampaignId) {
              const adsetInfo = await metaClient.getAdSetById(meta_adset_id)
              if (adsetInfo) {
                targetCampaignId = adsetInfo.campaign_id
              }
            }

            // For each creative variant, create 1 Ad
            for (const variant of uniqueVariants) {
              const variantData = creativesByVariant.get(variant)!
              const creative4x5 = variantData.creative4x5!
              const creative9x16 = variantData.creative9x16

              try {
                sendEvent('creating', {
                  package_id,
                  creative_variant: variant,
                  step: `Creating ad creative for V${variant} (${creative9x16 ? '4x5 + 9x16' : '4x5 only'})`,
                })

                // Create the ad creative with placement customization
                const adCreativeName = `${pkg.title} - ${pkg.tc_package_id} - V${variant}`

                const metaCreativeId = await metaClient.createWhatsAppAdCreative({
                  name: adCreativeName,
                  imageHash4x5: creative4x5.meta_image_hash,
                  imageHash9x16: creative9x16?.meta_image_hash,
                  videoId4x5: creative4x5.meta_video_id,
                  videoId9x16: creative9x16?.meta_video_id,
                  copies: copyVariations,
                  waMessageTemplate,
                  tcPackageId: pkg.tc_package_id,
                  instagramUserId: getInstagramUserId(),
                })

                sendEvent('creating', {
                  package_id,
                  creative_variant: variant,
                  step: `Creative created (${metaCreativeId}), creating ad in AdSet`,
                })

                // Create the Ad in the existing AdSet
                const adName = `${pkg.title} - ${pkg.tc_package_id} - V${variant}`
                const metaAdId = await metaClient.createAdFromCreative({
                  name: adName,
                  adsetId: meta_adset_id,
                  creativeId: metaCreativeId,
                  status: 'ACTIVE',
                })

                // Save Ad to database
                await db.from('meta_ads').upsert(
                  {
                    package_id,
                    tc_package_id: pkg.tc_package_id,
                    variant,
                    meta_ad_id: metaAdId,
                    meta_adset_id: meta_adset_id,
                    meta_creative_id: metaCreativeId,
                    ad_name: adName,
                    status: 'ACTIVE',
                    creative_id: creative4x5.id,
                    published_at: new Date().toISOString(),
                  },
                  { onConflict: 'package_id,variant,meta_adset_id' }
                )

                totalCreated++
                sendEvent('created', {
                  package_id,
                  creative_variant: variant,
                  meta_ad_id: metaAdId,
                  meta_adset_id: meta_adset_id,
                  meta_creative_id: metaCreativeId,
                  copies_count: copies.length,
                  has_9x16: !!creative9x16,
                })

                // Small delay between ad creations
                await new Promise((resolve) => setTimeout(resolve, 500))
              } catch (error) {
                console.error(`[Meta Ads] Error creating ad for package ${package_id} V${variant}:`, error)
                totalErrors++
                sendEvent('error', {
                  package_id,
                  creative_variant: variant,
                  error: error instanceof Error ? error.message : 'Unknown error',
                })
              }
            }

            // Update package with ad count (only non-deleted ads)
            const { count: adCount } = await db
              .from('meta_ads')
              .select('*', { count: 'exact', head: true })
              .eq('package_id', package_id)
              .neq('status', 'DELETED')

            await db
              .from('packages')
              .update({
                marketing_status: 'active',
                ads_created_count: adCount || 0,
              })
              .eq('id', package_id)
          } catch (error) {
            console.error(`[Meta Ads] Error for package ${package_id}:`, error)
            totalErrors++
            sendEvent('error', {
              package_id,
              error: error instanceof Error ? error.message : 'Unknown error',
            })
          }
        }

        sendEvent('complete', {
          created: totalCreated,
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
    console.error('[Meta Ads POST] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error creating ads' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * GET /api/meta/ads?package_id=XXX or ?tc_package_id=XXX
 * Get ads for a package
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const packageId = request.nextUrl.searchParams.get('package_id')
  const tcPackageId = request.nextUrl.searchParams.get('tc_package_id')

  try {
    // Simple query without joins to avoid errors
    let query = db
      .from('meta_ads')
      .select('*')
      .order('variant', { ascending: true })

    if (packageId) {
      query = query.eq('package_id', parseInt(packageId))
    } else if (tcPackageId) {
      query = query.eq('tc_package_id', parseInt(tcPackageId))
    }

    const { data: ads, error } = await query

    if (error) {
      console.error('[Meta Ads GET] Query error:', error)
      throw error
    }

    console.log(`[Meta Ads GET] Found ${ads?.length || 0} ads for package_id=${packageId} tc_package_id=${tcPackageId}`)

    return new Response(JSON.stringify({ ads: ads || [] }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Meta Ads GET] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error fetching ads' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * DELETE /api/meta/ads
 * Delete ads from the database (and optionally from Meta)
 * Also updates ads_created_count in packages table
 *
 * Body: { ad_ids: number[], delete_from_meta?: boolean }
 */
export async function DELETE(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { ad_ids, delete_from_meta = false } = body as {
      ad_ids: number[]
      delete_from_meta?: boolean
    }

    if (!ad_ids || !Array.isArray(ad_ids) || ad_ids.length === 0) {
      return new Response(JSON.stringify({ error: 'ad_ids array is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    console.log(`[Meta Ads DELETE] Deleting ${ad_ids.length} ads, delete_from_meta=${delete_from_meta}`)

    // IMPORTANT: Get ads info BEFORE deleting (to know which packages to update)
    const { data: adsToDelete } = await db
      .from('meta_ads')
      .select('id, meta_ad_id, package_id')
      .in('id', ad_ids)

    if (!adsToDelete || adsToDelete.length === 0) {
      return new Response(JSON.stringify({ error: 'No ads found with those IDs' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    // Get unique package_ids that will be affected
    const affectedPackageIds = [...new Set(adsToDelete.map(ad => ad.package_id))]

    // If delete_from_meta is true, also delete from Meta
    if (delete_from_meta) {
      const metaClient = getMetaAdsClient()

      for (const ad of adsToDelete) {
        if (ad.meta_ad_id) {
          try {
            await metaClient.deleteAd(ad.meta_ad_id)
            console.log(`[Meta Ads DELETE] Deleted from Meta: ${ad.meta_ad_id}`)
          } catch (error) {
            // Log but continue - ad might already be deleted in Meta
            console.warn(`[Meta Ads DELETE] Could not delete from Meta: ${ad.meta_ad_id}`, error)
          }
        }
      }
    }

    // Delete from database
    const { error: deleteError } = await db
      .from('meta_ads')
      .delete()
      .in('id', ad_ids)

    if (deleteError) {
      console.error('[Meta Ads DELETE] Database error:', deleteError)
      throw deleteError
    }

    console.log(`[Meta Ads DELETE] Successfully deleted ${ad_ids.length} ads from database`)

    // Update ads_created_count for each affected package (only non-deleted ads)
    for (const packageId of affectedPackageIds) {
      const { count } = await db
        .from('meta_ads')
        .select('*', { count: 'exact', head: true })
        .eq('package_id', packageId)
        .neq('status', 'DELETED')

      await db
        .from('packages')
        .update({ ads_created_count: count || 0 })
        .eq('id', packageId)

      console.log(`[Meta Ads DELETE] Updated package ${packageId} ads_created_count to ${count || 0}`)
    }

    return new Response(JSON.stringify({
      success: true,
      deleted_count: ad_ids.length,
      updated_packages: affectedPackageIds,
    }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Meta Ads DELETE] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error deleting ads' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
