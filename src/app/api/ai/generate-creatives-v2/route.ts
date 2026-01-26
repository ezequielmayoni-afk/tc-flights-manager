/**
 * API Route: Generate AI Creatives V2
 *
 * New version with:
 * - Brand assets from database
 * - Variant prompts with "Sí" hooks
 * - Generation logging for debugging
 * - SSE streaming for real-time progress
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateCreativeImageV2,
  loadBrandAssets,
  loadAllVariantPrompts,
  validateConfig,
  type BrandAssets,
  type PromptVariant,
} from '@/lib/vertex-ai/client'
import {
  uploadCreative,
  getOrCreatePackageFolder,
  getOrCreateVariantFolder,
} from '@/lib/google-drive/client'
import type { PackageDataForAI } from '@/types/ai-creatives'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface GenerationLog {
  package_id: number
  tc_package_id: number
  variant: number
  aspect_ratio: string
  prompt_used: string
  model_used: string
  package_data: object
  assets_used: object
  status: 'pending' | 'generating' | 'success' | 'error'
  started_at: string
}

/**
 * Create a generation log entry
 */
async function createGenerationLog(
  db: ReturnType<typeof getSupabaseClient>,
  log: GenerationLog
): Promise<string | null> {
  const { data, error } = await db
    .from('ai_generation_logs')
    .insert(log)
    .select('id')
    .single()

  if (error) {
    console.error('[API V2] Error creating log:', error.message)
    return null
  }

  return data?.id
}

/**
 * Update a generation log entry
 */
async function updateGenerationLog(
  db: ReturnType<typeof getSupabaseClient>,
  logId: string,
  updates: Partial<{
    status: string
    completed_at: string
    duration_ms: number
    image_url: string
    image_file_id: string
    error_message: string
    error_details: object
    response_raw: object
  }>
): Promise<void> {
  const { error } = await db
    .from('ai_generation_logs')
    .update(updates)
    .eq('id', logId)

  if (error) {
    console.error('[API V2] Error updating log:', error.message)
  }
}

/**
 * POST /api/ai/generate-creatives-v2
 *
 * Generate AI creatives using the new V2 system with brand assets
 *
 * Body:
 * - packageId: number (tc_package_id)
 * - variants: number[] (which variants to generate, default: [1,2,3,4,5])
 * - aspectRatios: string[] (which aspect ratios to generate, default: ['1:1', '9:16'])
 * - includeLogo: boolean (whether to send logo as reference image)
 *
 * Returns SSE stream with progress updates
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    // Validate configuration
    const configCheck = validateConfig()
    if (!configCheck.valid) {
      return NextResponse.json(
        { error: 'AI not configured', details: configCheck.errors },
        { status: 500 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      packageId,
      variants = [1, 2, 3, 4, 5],
      aspectRatios = ['1:1', '9:16'],
      includeLogo = true,
    } = body

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )
    }

    // Validate variants
    const validVariants = variants.filter(
      (v: number) => v >= 1 && v <= 5
    ) as number[]

    if (validVariants.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid variant (1-5) is required' },
        { status: 400 }
      )
    }

    console.log(`[API V2] Starting generation for package ${packageId}, variants: ${validVariants.join(', ')}`)

    // Fetch package data
    const { data: pkg, error: fetchError } = await db
      .from('packages')
      .select(`
        id,
        tc_package_id,
        title,
        departure_date,
        date_range_start,
        date_range_end,
        nights_count,
        current_price_per_pax,
        total_price,
        currency,
        adults_count,
        children_count,
        infants_count,
        package_destinations (
          destination_name
        ),
        package_hotels (
          hotel_name,
          room_type,
          board_type,
          board_name
        ),
        package_transports (
          company,
          transport_number,
          departure_date
        )
      `)
      .eq('tc_package_id', packageId)
      .single()

    if (fetchError || !pkg) {
      console.error('[API V2] Package not found:', fetchError)
      return NextResponse.json(
        { error: `Package ${packageId} not found` },
        { status: 404 }
      )
    }

    // Transform to PackageDataForAI format
    const packageData: PackageDataForAI = {
      tc_package_id: pkg.tc_package_id,
      title: pkg.title,
      package_destinations: (pkg.package_destinations || []).map(
        (d: { destination_name: string }) => d.destination_name
      ),
      departure_date: pkg.departure_date,
      date_range_start: pkg.date_range_start,
      date_range_end: pkg.date_range_end,
      nights_count: pkg.nights_count || 0,
      current_price_per_pax: pkg.current_price_per_pax,
      total_price: pkg.total_price,
      currency: pkg.currency || 'USD',
      adults_count: pkg.adults_count || 0,
      children_count: pkg.children_count || 0,
      infants_count: pkg.infants_count || 0,
      hotel: pkg.package_hotels?.[0]
        ? {
            name: pkg.package_hotels[0].hotel_name,
            room_type: pkg.package_hotels[0].room_type,
            board_type: pkg.package_hotels[0].board_type,
            board_name: pkg.package_hotels[0].board_name,
          }
        : null,
      flight: pkg.package_transports?.length > 0
        ? {
            company: pkg.package_transports[0].company,
            flight_numbers: pkg.package_transports
              .map((t: { transport_number: string | null }) => t.transport_number)
              .filter((n): n is string => n !== null),
            departure_date: pkg.package_transports[0].departure_date,
          }
        : null,
    }

    // Load brand assets once
    const assets = await loadBrandAssets()
    const variantPrompts = await loadAllVariantPrompts()
    const variantMap = new Map(variantPrompts.map(v => [v.variant_number, v]))

    // Create SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
        }

        try {
          // Create package folder in Drive
          sendEvent('progress', { step: 'Creando carpeta en Drive...' })
          const packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)

          const results: Array<{
            variant: number
            aspectRatio: string
            success: boolean
            imageUrl?: string
            error?: string
          }> = []

          // Process each variant and aspect ratio
          for (const variantNumber of validVariants) {
            const variant = variantMap.get(variantNumber)
            if (!variant) {
              sendEvent('variant_error', {
                variant: variantNumber,
                error: `Variant ${variantNumber} not found in database`,
              })
              continue
            }

            // Create variant folder
            const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variantNumber)

            // Build aspect ratio configs based on requested aspectRatios
            // Mapping: '1:1' -> 1x1 Feed, '9:16' -> 9x16 Stories
            const aspectRatioConfigs: Array<{ geminiAspect: '1:1' | '9:16'; driveAspect: '1x1' | '9x16'; label: string }> = []

            for (const ar of aspectRatios as string[]) {
              if (ar === '1:1') {
                aspectRatioConfigs.push({ geminiAspect: '1:1', driveAspect: '1x1', label: '1x1 Feed' })
              } else if (ar === '9:16') {
                aspectRatioConfigs.push({ geminiAspect: '9:16', driveAspect: '9x16', label: '9x16 Stories' })
              }
            }

            // Generate requested aspect ratios
            for (const { geminiAspect, driveAspect, label } of aspectRatioConfigs) {
              const startTime = Date.now()

              // Create log entry
              const logId = await createGenerationLog(db, {
                package_id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                variant: variantNumber,
                aspect_ratio: driveAspect,
                prompt_used: '', // Will be updated after generation
                model_used: 'gemini-3-pro-image-preview',
                package_data: packageData,
                assets_used: {
                  system_instruction: !!assets.system_instruction,
                  logo_base64: includeLogo && !!assets.logo_base64,
                  reference_images: [assets.reference_image_1, assets.reference_image_2, assets.reference_image_3, assets.reference_image_4, assets.reference_image_5, assets.reference_image_6].filter(Boolean).length,
                },
                status: 'generating',
                started_at: new Date().toISOString(),
              })

              sendEvent('progress', {
                variant: variantNumber,
                aspectRatio: driveAspect,
                step: `Generando V${variantNumber} ${label} con Gemini...`,
              })

              try {
                // Generate the image with Gemini aspect ratio
                const result = await generateCreativeImageV2(
                  packageData,
                  variantNumber,
                  geminiAspect,
                  { assets, variant, includeLogo }
                )

                // Upload to Google Drive with correct naming (4x5.png or 9x16.png)
                sendEvent('progress', {
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  step: `Subiendo V${variantNumber} ${label} a Drive...`,
                })

                const buffer = Buffer.from(result.base64, 'base64')
                const uploaded = await uploadCreative(
                  variantFolderId,
                  driveAspect,
                  buffer,
                  'image/png'
                )

                const durationMs = Date.now() - startTime

                // Update log with success
                if (logId) {
                  await updateGenerationLog(db, logId, {
                    status: 'success',
                    completed_at: new Date().toISOString(),
                    duration_ms: durationMs,
                    image_url: uploaded.webViewLink,
                    image_file_id: uploaded.id,
                  })
                }

                // Save to package_ai_creatives (for backwards compatibility)
                // 1x1 maps to image_1080, 9x16 maps to image_1920
                const creativeUpdateField = driveAspect === '1x1'
                  ? { image_1080_file_id: uploaded.id, image_1080_url: uploaded.webViewLink }
                  : driveAspect === '9x16'
                  ? { image_1920_file_id: uploaded.id, image_1920_url: uploaded.webViewLink }
                  : {} // 4x5 not stored in this table

                await db
                  .from('package_ai_creatives')
                  .upsert({
                    package_id: pkg.id,
                    tc_package_id: pkg.tc_package_id,
                    variant: variantNumber,
                    concepto: variant.name,
                    model_used: 'gemini-3-pro-image-preview',
                    imagen_model_used: 'gemini-3-pro-image-preview',
                    prompt_version: 'v2-si',
                    ...creativeUpdateField,
                  }, { onConflict: 'package_id,variant' })

                results.push({
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  success: true,
                  imageUrl: uploaded.webViewLink,
                })

                sendEvent('variant_complete', {
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  imageUrl: uploaded.webViewLink,
                  durationMs,
                })

              } catch (error) {
                const durationMs = Date.now() - startTime
                const errorMessage = error instanceof Error ? error.message : 'Unknown error'

                // Update log with error
                if (logId) {
                  await updateGenerationLog(db, logId, {
                    status: 'error',
                    completed_at: new Date().toISOString(),
                    duration_ms: durationMs,
                    error_message: errorMessage,
                  })
                }

                results.push({
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  success: false,
                  error: errorMessage,
                })

                sendEvent('variant_error', {
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  error: errorMessage,
                })

                console.error(`[API V2] Error generating V${variantNumber} ${label}:`, error)
              }
            }
          }

          // All done
          sendEvent('complete', {
            packageId: pkg.tc_package_id,
            results,
            successCount: results.filter(r => r.success).length,
            errorCount: results.filter(r => !r.success).length,
            totalGenerated: results.filter(r => r.success).length,
          })

        } catch (error) {
          console.error('[API V2] Fatal error:', error)
          sendEvent('error', {
            error: error instanceof Error ? error.message : 'Unknown error',
          })
        }

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
    console.error('[API V2] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/ai/generate-creatives-v2
 *
 * Get generation logs for a package
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const packageId = searchParams.get('packageId')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    let query = db
      .from('ai_generation_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)

    if (packageId) {
      query = query.eq('tc_package_id', parseInt(packageId))
    }

    const { data: logs, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      logs: logs || [],
      count: logs?.length || 0,
    })

  } catch (error) {
    console.error('[API V2] Error fetching logs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
