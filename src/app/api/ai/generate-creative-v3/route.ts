/**
 * API Route: Generate AI Creatives V3
 *
 * Nueva versión con sistema de 3 capas:
 * - Capa 1: Prompts de imagen (destino + sentimiento)
 * - Capa 2: Copy y textos (datos + tono + marca)
 * - Capa 3: Assets y composición (layout + elementos)
 *
 * Usa las mismas funciones de Gemini y Drive que v2
 */

import { NextRequest, NextResponse } from 'next/server'
import {
  validateConfig,
  loadBrandAssets,
  type BrandAssets,
} from '@/lib/vertex-ai/client'
import {
  uploadCreative,
  getOrCreatePackageFolder,
  getOrCreateVariantFolder,
  type AspectRatio,
} from '@/lib/google-drive/client'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  buildCreativePrompt,
  packageToPackageData,
  getPromptSummary,
  type VariantNumber,
  type PackageData,
} from '@/lib/creatives'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

// ============================================
// SUPABASE CLIENT
// ============================================


// ============================================
// GEMINI IMAGE GENERATION (usando el nuevo sistema de prompts)
// Usa la misma API que v2: Gemini API directa con GEMINI_API_KEY
// ============================================

const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview'

// Helper function to parse base64 data and extract mime type
function parseBase64Image(base64Data: string): { mimeType: string; data: string } {
  let data = base64Data
  let mimeType = 'image/png'

  if (data.startsWith('data:')) {
    const match = data.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      mimeType = match[1]
      data = match[2]
    }
  }

  return { mimeType, data }
}

async function generateImageWithV3Prompt(
  prompt: string,
  aspectRatio: '1:1' | '9:16' | '4:5',
  assets: BrandAssets
): Promise<{ base64: string; prompt: string }> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${apiKey}`

  // Construir partes del request
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = []

  // Agregar prompt principal
  parts.push({ text: prompt })

  // Agregar logo si está disponible
  if (assets.logo_base64) {
    const { mimeType, data } = parseBase64Image(assets.logo_base64)
    parts.push({ inlineData: { mimeType, data } })
  }

  // Agregar imágenes de referencia
  const referenceImages = [
    assets.reference_image_1,
    assets.reference_image_2,
    assets.reference_image_3,
    assets.reference_image_4,
    assets.reference_image_5,
    assets.reference_image_6,
  ].filter(Boolean)

  for (const refImage of referenceImages) {
    if (refImage) {
      const { mimeType, data } = parseBase64Image(refImage)
      parts.push({ inlineData: { mimeType, data } })
    }
  }

  // Build request body (igual que v2)
  const requestBody: {
    contents: Array<{ parts: typeof parts }>
    system_instruction?: { parts: Array<{ text: string }> }
    generationConfig: {
      responseModalities: string[]
      temperature: number
      imageConfig: { aspectRatio: string }
    }
  } = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 1.0,
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    },
  }

  // Add system instruction if available
  if (assets.system_instruction) {
    requestBody.system_instruction = {
      parts: [{ text: assets.system_instruction }]
    }
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[API V3] Gemini API error:', errorText)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()

  // Extraer imagen de la respuesta
  const responseParts = result.candidates?.[0]?.content?.parts
  if (!responseParts || responseParts.length === 0) {
    throw new Error('No content in Gemini response')
  }

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      return {
        base64: part.inlineData.data,
        prompt,
      }
    }
  }

  throw new Error('No image data in Gemini response')
}

// ============================================
// LOGGING
// ============================================

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

async function createGenerationLog(
  db: ReturnType<typeof createAdminClient>,
  log: GenerationLog
): Promise<string | null> {
  const { data, error } = await db
    .from('ai_generation_logs')
    .insert(log)
    .select('id')
    .single()

  if (error) {
    console.error('[API V3] Error creating log:', error.message)
    return null
  }

  return data?.id
}

async function updateGenerationLog(
  db: ReturnType<typeof createAdminClient>,
  logId: string,
  updates: Partial<{
    status: string
    completed_at: string
    duration_ms: number
    image_url: string
    image_file_id: string
    error_message: string
    error_details: object
    prompt_used: string
  }>
): Promise<void> {
  const { error } = await db
    .from('ai_generation_logs')
    .update(updates)
    .eq('id', logId)

  if (error) {
    console.error('[API V3] Error updating log:', error.message)
  }
}

// ============================================
// API ROUTE
// ============================================

/**
 * POST /api/ai/generate-creative-v3
 *
 * Genera creativos usando el sistema de 3 capas
 *
 * Body:
 * - packageId: number (tc_package_id)
 * - variants: number[] (cuáles variantes generar, default: [1,2,3,4,5])
 * - aspectRatios: string[] (cuáles formatos generar, default: ['1:1', '9:16'])
 *
 * Returns SSE stream con progreso
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    // Validar configuración
    const configCheck = validateConfig()
    if (!configCheck.valid) {
      return NextResponse.json(
        { error: 'AI not configured', details: configCheck.errors },
        { status: 500 }
      )
    }

    // Parsear body
    const body = await request.json()
    const {
      packageId,
      variants = [1, 2, 3, 4, 5],
      aspectRatios = ['4x5', '9x16'],
    } = body

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )
    }

    // Validar variantes
    const validVariants = variants.filter(
      (v: number) => v >= 1 && v <= 5
    ) as VariantNumber[]

    if (validVariants.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid variant (1-5) is required' },
        { status: 400 }
      )
    }

    console.log(`[API V3] Starting generation for package ${packageId}, variants: ${validVariants.join(', ')}`)

    // Obtener datos del paquete
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
      console.error('[API V3] Package not found:', fetchError)
      return NextResponse.json(
        { error: `Package ${packageId} not found` },
        { status: 404 }
      )
    }

    // Convertir a PackageData para el sistema de 3 capas
    const packageData: PackageData = packageToPackageData({
      package_destinations: (pkg.package_destinations || []).map(
        (d: { destination_name: string }) => d.destination_name
      ),
      current_price_per_pax: pkg.current_price_per_pax,
      currency: pkg.currency,
      nights_count: pkg.nights_count,
      departure_date: pkg.departure_date,
      hotel: pkg.package_hotels?.[0]
        ? {
            name: pkg.package_hotels[0].hotel_name,
            board_type: pkg.package_hotels[0].board_type,
          }
        : null,
      flight: pkg.package_transports?.[0]
        ? {
            company: pkg.package_transports[0].company,
          }
        : null,
    })

    // Cargar brand assets
    const assets = await loadBrandAssets()

    // Crear SSE stream
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (type: string, data: Record<string, unknown>) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
        }

        try {
          // Crear carpeta del paquete en Drive
          sendEvent('progress', { step: 'Creando carpeta en Drive...' })
          const packageFolderId = await getOrCreatePackageFolder(pkg.tc_package_id)

          const results: Array<{
            variant: number
            aspectRatio: string
            success: boolean
            imageUrl?: string
            error?: string
            promptSummary?: object
          }> = []

          // Procesar cada variante
          for (const variantNumber of validVariants) {
            // Crear carpeta de variante
            const variantFolderId = await getOrCreateVariantFolder(packageFolderId, variantNumber)

            // Mapear aspect ratios
            const aspectRatioConfigs: Array<{
              geminiAspect: '1:1' | '9:16' | '4:5'
              driveAspect: AspectRatio
              label: string
            }> = []

            for (const ar of aspectRatios as string[]) {
              if (ar === '4x5' || ar === '4:5') {
                aspectRatioConfigs.push({ geminiAspect: '4:5', driveAspect: '4x5', label: '4x5 Feed' })
              } else if (ar === '9x16' || ar === '9:16') {
                aspectRatioConfigs.push({ geminiAspect: '9:16', driveAspect: '9x16', label: '9x16 Stories' })
              }
            }

            // Generar cada formato
            for (const { geminiAspect, driveAspect, label } of aspectRatioConfigs) {
              const startTime = Date.now()

              // Construir prompt usando el sistema de 3 capas
              const promptResult = buildCreativePrompt({
                packageData,
                variantNumber,
                aspectRatio: geminiAspect,
              })

              const summary = getPromptSummary(promptResult)

              // Crear log
              const logId = await createGenerationLog(db, {
                package_id: pkg.id,
                tc_package_id: pkg.tc_package_id,
                variant: variantNumber,
                aspect_ratio: driveAspect,
                prompt_used: promptResult.fullPrompt.substring(0, 5000), // Limitar tamaño
                model_used: 'gemini-2.0-flash-exp',
                package_data: packageData,
                assets_used: {
                  logo: !!assets.logo_base64,
                  reference_images: [
                    assets.reference_image_1,
                    assets.reference_image_2,
                    assets.reference_image_3,
                  ].filter(Boolean).length,
                  layer1: summary.destination,
                  layer2: summary.headline,
                  layer3: summary.assets,
                },
                status: 'generating',
                started_at: new Date().toISOString(),
              })

              sendEvent('progress', {
                variant: variantNumber,
                aspectRatio: driveAspect,
                step: `Generando V${variantNumber} ${label} - ${summary.headline}...`,
                promptSummary: summary,
              })

              try {
                // Generar imagen con Gemini
                const result = await generateImageWithV3Prompt(
                  promptResult.fullPrompt,
                  geminiAspect,
                  assets
                )

                // Subir a Drive
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

                // Actualizar log
                if (logId) {
                  await updateGenerationLog(db, logId, {
                    status: 'success',
                    completed_at: new Date().toISOString(),
                    duration_ms: durationMs,
                    image_url: uploaded.webViewLink,
                    image_file_id: uploaded.id,
                  })
                }

                results.push({
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  success: true,
                  imageUrl: uploaded.webViewLink,
                  promptSummary: summary,
                })

                sendEvent('variant_complete', {
                  variant: variantNumber,
                  aspectRatio: driveAspect,
                  imageUrl: uploaded.webViewLink,
                  durationMs,
                  promptSummary: summary,
                })

              } catch (genError) {
                const errorMessage = genError instanceof Error ? genError.message : 'Unknown error'
                console.error(`[API V3] Error generating V${variantNumber} ${driveAspect}:`, errorMessage)

                if (logId) {
                  await updateGenerationLog(db, logId, {
                    status: 'error',
                    completed_at: new Date().toISOString(),
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
              }
            }
          }

          // Enviar resumen final
          sendEvent('complete', {
            packageId: pkg.tc_package_id,
            results,
            successCount: results.filter(r => r.success).length,
            errorCount: results.filter(r => !r.success).length,
          })

        } catch (streamError) {
          const errorMessage = streamError instanceof Error ? streamError.message : 'Unknown error'
          console.error('[API V3] Stream error:', errorMessage)
          sendEvent('error', { message: errorMessage })
        } finally {
          controller.close()
        }
      },
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('[API V3] Error:', error)
    return errorResponse(error)
  }
}

/**
 * GET /api/ai/generate-creative-v3
 *
 * Retorna información sobre el sistema V3
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  return NextResponse.json({
    version: 'v3',
    name: 'Creative Generation System - 3 Layers',
    description: 'Sistema de generación de creativos basado en 3 capas: Imagen, Copy y Composición',
    layers: {
      layer1: 'Prompts de imagen (destino + sentimiento)',
      layer2: 'Copy y textos (datos + tono + marca)',
      layer3: 'Assets y composición (layout + elementos)',
    },
    variants: [
      { number: 1, name: 'PRECIO / OFERTA', focus: 'Urgencia por valor' },
      { number: 2, name: 'EXPERIENCIA / EMOCIÓN', focus: 'Apelar al deseo' },
      { number: 3, name: 'DESTINO', focus: 'Lo único del lugar' },
      { number: 4, name: 'CONVENIENCIA', focus: 'Todo resuelto' },
      { number: 5, name: 'ESCASEZ', focus: 'Últimos lugares' },
    ],
    aspectRatios: ['4x5', '9x16'],
    usage: {
      method: 'POST',
      body: {
        packageId: 'number (required) - tc_package_id',
        variants: 'number[] (optional) - default: [1,2,3,4,5]',
        aspectRatios: 'string[] (optional) - default: ["4x5", "9x16"]',
      },
    },
  })
}
