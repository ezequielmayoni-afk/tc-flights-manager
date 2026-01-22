import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateSingleVariantWithGemini,
  generateVariantImages,
  validateConfig,
  VARIANT_CONFIGS,
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

/**
 * POST /api/ai/generate-creatives
 * Generate AI creatives for a package using Gemini + Imagen 3
 * Processes each variant SEQUENTIALLY: Gemini → Imagen → Drive upload → next variant
 *
 * Body:
 * - packageId: number (tc_package_id)
 * - variants: number[] (which variants to generate, e.g., [1, 2, 3])
 * - generateImages: boolean (whether to generate images with Imagen 3)
 *
 * Returns SSE stream with progress updates
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    // Validate Vertex AI configuration
    const configCheck = validateConfig()
    if (!configCheck.valid) {
      return NextResponse.json(
        { error: 'Vertex AI not configured', details: configCheck.errors },
        { status: 500 }
      )
    }

    // Parse request body
    const body = await request.json()
    const {
      packageId,
      variants = [1, 2, 3, 4, 5], // Default: all 5 variants
      generateImages = true,
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
    ) as (1 | 2 | 3 | 4 | 5)[]

    if (validVariants.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid variant (1-5) is required' },
        { status: 400 }
      )
    }

    console.log(`[AI Creatives] Starting generation for package ${packageId}, variants: ${validVariants.join(', ')}`)

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
      console.error('[AI Creatives] Package not found:', fetchError)
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

    // Create SSE stream for progress updates
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
        }

        try {
          // Create package folder in Drive (once, before variants)
          let packageFolderId: string | null = null
          if (generateImages) {
            sendEvent('progress', { step: 'Creando carpeta en Drive...' })
            packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)
          }

          const results: {
            variant: number
            success: boolean
            images?: { aspectRatio: string; url: string }[]
            error?: string
          }[] = []

          // Process each variant SEQUENTIALLY
          for (const variantNumber of validVariants) {
            const config = VARIANT_CONFIGS[variantNumber]

            try {
              // Step 1: Generate with Gemini
              sendEvent('progress', {
                variant: variantNumber,
                step: `Generando V${variantNumber} (${config.name}) con Gemini...`,
              })

              const variantOutput = await generateSingleVariantWithGemini(packageData, variantNumber)

              // Step 2: Save to database
              sendEvent('progress', {
                variant: variantNumber,
                step: `Guardando V${variantNumber} en base de datos...`,
              })

              const creativeData = {
                package_id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                variant: variantNumber,
                concepto: variantOutput.concepto,
                // Format 1080
                titulo_principal_1080: variantOutput.formato_1080.titulo_principal,
                subtitulo_1080: variantOutput.formato_1080.subtitulo,
                precio_texto_1080: variantOutput.formato_1080.precio_texto,
                cta_1080: variantOutput.formato_1080.cta,
                descripcion_imagen_1080: variantOutput.formato_1080.descripcion_imagen,
                estilo_1080: variantOutput.formato_1080.estilo,
                // Format 1920
                titulo_principal_1920: variantOutput.formato_1920.titulo_principal,
                subtitulo_1920: variantOutput.formato_1920.subtitulo,
                precio_texto_1920: variantOutput.formato_1920.precio_texto,
                cta_1920: variantOutput.formato_1920.cta,
                descripcion_imagen_1920: variantOutput.formato_1920.descripcion_imagen,
                estilo_1920: variantOutput.formato_1920.estilo,
                // Metadata
                model_used: 'gemini-2.0-flash',
                prompt_version: 'v3',
                destino: variantOutput.metadata?.destino || null,
                fecha_salida: variantOutput.metadata?.fecha_salida || null,
                precio_base: variantOutput.metadata?.precio_base || null,
                currency: variantOutput.metadata?.currency || 'USD',
                noches: variantOutput.metadata?.noches || null,
                regimen: variantOutput.metadata?.regimen || null,
              }

              await db
                .from('package_ai_creatives')
                .upsert(creativeData, { onConflict: 'package_id,variant' })

              // Step 3: Generate images with Imagen 3
              const variantImages: { aspectRatio: string; url: string }[] = []

              if (generateImages && packageFolderId) {
                sendEvent('progress', {
                  variant: variantNumber,
                  step: `Generando imágenes V${variantNumber} con Imagen 3...`,
                })

                const images = await generateVariantImages(
                  {
                    concepto: variantOutput.concepto,
                    formato_1080: variantOutput.formato_1080,
                    formato_1920: variantOutput.formato_1920,
                  },
                  variantNumber
                )

                // Step 4: Upload to Google Drive
                const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variantNumber)

                for (const image of images) {
                  try {
                    sendEvent('progress', {
                      variant: variantNumber,
                      step: `Subiendo ${image.aspectRatio} de V${variantNumber} a Drive...`,
                    })

                    const buffer = Buffer.from(image.base64, 'base64')
                    const uploaded = await uploadCreative(
                      variantFolderId,
                      image.aspectRatio,
                      buffer,
                      'image/png',
                      `ai_generated_${image.aspectRatio}.png`
                    )

                    // Update database with image URL
                    const updateField = image.aspectRatio === '1080'
                      ? { image_1080_file_id: uploaded.id, image_1080_url: uploaded.webViewLink }
                      : { image_1920_file_id: uploaded.id, image_1920_url: uploaded.webViewLink }

                    await db
                      .from('package_ai_creatives')
                      .update({
                        ...updateField,
                        imagen_model_used: 'imagen-3.0-generate-001',
                      })
                      .eq('package_id', pkg.id)
                      .eq('variant', variantNumber)

                    variantImages.push({
                      aspectRatio: image.aspectRatio,
                      url: uploaded.webViewLink,
                    })
                  } catch (uploadError) {
                    console.error(`[AI Creatives] Upload error V${variantNumber}:`, uploadError)
                  }
                }
              }

              // Variant completed successfully
              sendEvent('variant_complete', {
                variant: variantNumber,
                name: config.name,
                images: variantImages,
              })

              results.push({
                variant: variantNumber,
                success: true,
                images: variantImages,
              })

            } catch (variantError) {
              console.error(`[AI Creatives] Error processing variant ${variantNumber}:`, variantError)

              sendEvent('variant_error', {
                variant: variantNumber,
                error: variantError instanceof Error ? variantError.message : 'Unknown error',
              })

              results.push({
                variant: variantNumber,
                success: false,
                error: variantError instanceof Error ? variantError.message : 'Unknown error',
              })
            }
          }

          // All variants processed
          sendEvent('complete', {
            packageId: pkg.tc_package_id,
            results,
            successCount: results.filter(r => r.success).length,
            errorCount: results.filter(r => !r.success).length,
          })

        } catch (error) {
          console.error('[AI Creatives] Fatal error:', error)
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
    console.error('[AI Creatives] Error:', error)
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
 * GET /api/ai/generate-creatives?packageId=xxx
 * Get existing AI creatives for a package
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const packageId = searchParams.get('packageId')

  if (!packageId) {
    return NextResponse.json(
      { error: 'packageId query param is required' },
      { status: 400 }
    )
  }

  try {
    const { data: creatives, error } = await db
      .from('package_ai_creatives')
      .select('*')
      .eq('tc_package_id', parseInt(packageId))
      .order('variant', { ascending: true })

    if (error) {
      throw error
    }

    return NextResponse.json({
      packageId: parseInt(packageId),
      creatives: creatives || [],
      hasCreatives: (creatives?.length || 0) > 0,
    })
  } catch (error) {
    console.error('[AI Creatives] Error fetching creatives:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
