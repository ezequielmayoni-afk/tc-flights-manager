import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import {
  generateCreativesWithGemini,
  generateVariantImages,
  validateConfig,
} from '@/lib/vertex-ai/client'
import {
  uploadCreative,
  getOrCreatePackageFolder,
  getOrCreateVariantFolder,
} from '@/lib/google-drive/client'
import type {
  PackageDataForAI,
  AICreativeOutput,
  GenerateCreativesResponse,
} from '@/types/ai-creatives'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/ai/generate-creatives
 * Generate AI creatives for a package using Gemini + Imagen 3
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
    const { packageId, regenerateImages = false, generateImages = true } = body

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )
    }

    console.log(`[AI Creatives] Starting generation for package ${packageId}`)

    // Fetch full package data from database
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

    console.log('[AI Creatives] Calling Gemini...')

    // Generate creatives with Gemini
    const output = await generateCreativesWithGemini(packageData)

    console.log('[AI Creatives] Gemini response received, saving to DB...')

    // Save creatives to database
    const variants = ['v1', 'v2', 'v3', 'v4', 'v5'] as const
    const savedCreatives = []

    for (let i = 0; i < variants.length; i++) {
      const variantKey = variants[i]
      const variant = output[variantKey]
      const variantNumber = i + 1

      // Upsert creative record
      const creativeData = {
        package_id: pkg.id,
        tc_package_id: pkg.tc_package_id,
        variant: variantNumber,
        titulo_principal: variant.titulo_principal,
        subtitulo: variant.subtitulo,
        precio_texto: variant.precio_texto,
        cta: variant.cta,
        descripcion_imagen: variant.descripcion_imagen,
        estilo: variant.estilo,
        model_used: 'gemini-1.5-pro',
        prompt_version: 'v2',
        destino: output.metadata?.destino || null,
        fecha_salida: output.metadata?.fecha_salida || null,
        precio_base: output.metadata?.precio_base || null,
        currency: output.metadata?.currency || 'USD',
        noches: output.metadata?.noches || null,
        regimen: output.metadata?.regimen || null,
      }

      const { data: savedCreative, error: saveError } = await db
        .from('package_ai_creatives')
        .upsert(creativeData, {
          onConflict: 'package_id,variant',
        })
        .select()
        .single()

      if (saveError) {
        console.error(`[AI Creatives] Failed to save variant ${variantNumber}:`, saveError)
      } else {
        savedCreatives.push(savedCreative)
      }
    }

    console.log(`[AI Creatives] Saved ${savedCreatives.length} creatives to DB`)

    // Optionally generate images with Imagen 3
    let generatedImages: { variant: number; aspectRatio: '4x5' | '9x16'; fileId?: string; imageUrl: string }[] = []

    if (generateImages) {
      console.log('[AI Creatives] Generating images with Imagen 3...')

      // Create package folder in Google Drive
      const packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)

      for (let i = 0; i < variants.length; i++) {
        const variantKey = variants[i]
        const variant = output[variantKey]
        const variantNumber = i + 1

        try {
          // Generate images for this variant
          const images = await generateVariantImages(variant, variantNumber)

          // Create variant folder and upload images
          const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variantNumber)

          for (const image of images) {
            try {
              // Convert base64 to buffer
              const buffer = Buffer.from(image.base64, 'base64')

              // Upload to Google Drive
              const uploaded = await uploadCreative(
                variantFolderId,
                image.aspectRatio,
                buffer,
                'image/png',
                `ai_generated_${image.aspectRatio}.png`
              )

              // Update database with image info
              const updateField = image.aspectRatio === '4x5'
                ? { image_4x5_file_id: uploaded.id, image_4x5_url: uploaded.webViewLink }
                : { image_9x16_file_id: uploaded.id, image_9x16_url: uploaded.webViewLink }

              await db
                .from('package_ai_creatives')
                .update({
                  ...updateField,
                  imagen_model_used: 'imagen-3.0-generate-001',
                })
                .eq('package_id', pkg.id)
                .eq('variant', variantNumber)

              generatedImages.push({
                variant: variantNumber,
                aspectRatio: image.aspectRatio,
                fileId: uploaded.id,
                imageUrl: uploaded.webViewLink,
              })

              console.log(`[AI Creatives] Uploaded ${image.aspectRatio} for variant ${variantNumber}`)
            } catch (uploadError) {
              console.error(`[AI Creatives] Failed to upload ${image.aspectRatio} for variant ${variantNumber}:`, uploadError)
            }
          }
        } catch (imageError) {
          console.error(`[AI Creatives] Failed to generate images for variant ${variantNumber}:`, imageError)
        }
      }
    }

    console.log('[AI Creatives] Generation complete!')

    const response: GenerateCreativesResponse = {
      success: true,
      packageId: pkg.tc_package_id,
      output,
      images: generatedImages.length > 0 ? generatedImages : undefined,
      savedToDb: savedCreatives.length > 0,
    }

    return NextResponse.json(response)
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
