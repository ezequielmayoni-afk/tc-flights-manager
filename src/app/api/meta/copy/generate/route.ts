import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import type { AdCopyVariant, GeneratedCopyResponse } from '@/lib/meta-ads/types'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY!,
    })
  }
  return openaiClient
}

/**
 * Replace placeholders in the prompt template with package data
 */
function buildPrompt(template: string, packageData: Record<string, unknown>): string {
  let prompt = template

  const replacements: Record<string, string> = {
    // Info Basica
    '{title}': String(packageData.title || ''),
    '{large_title}': String(packageData.large_title || packageData.title || ''),
    '{destinations}': String(packageData.destinations || ''),
    '{price}': String(packageData.price || 0),
    '{currency}': String(packageData.currency || 'USD'),
    '{nights}': String(packageData.nights || 0),
    '{adults}': String(packageData.adults || 2),
    '{children}': String(packageData.children || 0),
    '{departure_date}': String(packageData.departure_date || ''),
    '{date_range}': String(packageData.date_range || ''),
    '{themes}': Array.isArray(packageData.themes) ? packageData.themes.join(', ') : String(packageData.themes || ''),
    '{tc_package_id}': String(packageData.tc_package_id || ''),
    // Origen
    '{origin_city}': String(packageData.origin_city || ''),
    '{origin_country}': String(packageData.origin_country || ''),
    // Hotel
    '{hotel_name}': String(packageData.hotel_name || ''),
    '{hotel_category}': String(packageData.hotel_category || ''),
    '{hotel_stars}': String(packageData.hotel_stars || ''),
    '{room_type}': String(packageData.room_type || ''),
    '{board_type}': String(packageData.board_type || ''),
    '{hotel_nights}': String(packageData.hotel_nights || ''),
    '{hotel_address}': String(packageData.hotel_address || ''),
    // Vuelo
    '{airline}': String(packageData.airline || ''),
    '{airline_code}': String(packageData.airline_code || ''),
    '{flight_departure}': String(packageData.flight_departure || ''),
    '{flight_arrival}': String(packageData.flight_arrival || ''),
    '{cabin_class}': String(packageData.cabin_class || ''),
    '{baggage_info}': String(packageData.baggage_info || ''),
    // Conteos
    '{hotels_count}': String(packageData.hotels_count || 0),
    '{transfers_count}': String(packageData.transfers_count || 0),
    '{flights_count}': String(packageData.flights_count || 0),
    // Inclusiones
    '{includes_flights}': packageData.flights_count ? 'Si' : 'No',
    '{includes_hotel}': packageData.hotels_count ? 'Si' : 'No',
    '{includes_transfers}': packageData.transfers_count ? 'Si' : 'No',
    '{includes_all_inclusive}': packageData.board_type === 'All Inclusive' ? 'Si' : 'No',
    // Legacy
    '{includes}': String(packageData.includes || 'Vuelo + Hotel + Traslados'),
  }

  for (const [placeholder, value] of Object.entries(replacements)) {
    prompt = prompt.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value)
  }

  return prompt
}

/**
 * Parse AI response to extract copy variants
 */
function parseAIResponse(content: string): GeneratedCopyResponse {
  // Remove markdown code blocks if present
  let cleanContent = content.trim()
  if (cleanContent.startsWith('```json')) {
    cleanContent = cleanContent.slice(7)
  } else if (cleanContent.startsWith('```')) {
    cleanContent = cleanContent.slice(3)
  }
  if (cleanContent.endsWith('```')) {
    cleanContent = cleanContent.slice(0, -3)
  }

  return JSON.parse(cleanContent.trim())
}

/**
 * POST /api/meta/copy/generate
 * Generate ad copy variants using AI
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { packageIds, variants: requestedVariants } = body as {
      packageIds: number[]
      variants?: number[]  // Optional: only regenerate specific variants (1-5)
    }

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return NextResponse.json(
        { error: 'packageIds is required' },
        { status: 400 }
      )
    }

    // Validate requested variants if provided
    const variantsToSave = requestedVariants && requestedVariants.length > 0
      ? requestedVariants.filter(v => v >= 1 && v <= 5)
      : [1, 2, 3, 4, 5]  // Default: all variants

    // Get prompt template
    const { data: configData } = await db
      .from('meta_copy_prompt_config')
      .select('prompt_template')
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!configData?.prompt_template) {
      return NextResponse.json(
        { error: 'No active prompt template configured' },
        { status: 400 }
      )
    }

    const openai = getOpenAIClient()
    const results: Array<{
      package_id: number
      variants: AdCopyVariant[]
      status: 'success' | 'error'
      error?: string
    }> = []

    for (const packageId of packageIds) {
      try {
        // Get package data with destinations, hotels, and transports
        const { data: pkg, error: pkgError } = await db
          .from('packages')
          .select(`
            *,
            package_destinations (destination_name),
            package_hotels (hotel_name, hotel_category, room_type, board_type, nights, address),
            package_transports (company, marketing_airline_code, departure_time, arrival_time, cabin_class, baggage_info)
          `)
          .eq('id', packageId)
          .single()

        if (pkgError || !pkg) {
          results.push({
            package_id: packageId,
            variants: [],
            status: 'error',
            error: 'Package not found',
          })
          continue
        }

        // Build package data for prompt
        const destinations = pkg.package_destinations
          ?.map((d: { destination_name: string }) => d.destination_name)
          .join(', ') || ''

        const hotel = pkg.package_hotels?.[0] as {
          hotel_name?: string
          hotel_category?: string
          room_type?: string
          board_type?: string
          nights?: number
          address?: string
        } | undefined

        const transport = pkg.package_transports?.[0] as {
          company?: string
          marketing_airline_code?: string
          departure_time?: string
          arrival_time?: string
          cabin_class?: string
          baggage_info?: string
        } | undefined

        const packageData = {
          // Info Basica
          tc_package_id: pkg.tc_package_id,
          title: pkg.title,
          large_title: pkg.large_title,
          destinations,
          price: pkg.current_price_per_pax,
          currency: pkg.currency,
          nights: pkg.nights_count,
          adults: pkg.adults_count,
          children: pkg.children_count || 0,
          departure_date: pkg.departure_date,
          date_range: pkg.date_range || '',
          themes: pkg.themes,
          // Origen
          origin_city: pkg.origin_city || '',
          origin_country: pkg.origin_country || '',
          // Hotel
          hotel_name: hotel?.hotel_name || '',
          hotel_category: hotel?.hotel_category || '',
          hotel_stars: hotel?.hotel_category || '',
          room_type: hotel?.room_type || '',
          board_type: hotel?.board_type || '',
          hotel_nights: hotel?.nights || pkg.nights_count,
          hotel_address: hotel?.address || '',
          // Vuelo
          airline: transport?.company || pkg.airline_name || '',
          airline_code: transport?.marketing_airline_code || '',
          flight_departure: transport?.departure_time || '',
          flight_arrival: transport?.arrival_time || '',
          cabin_class: transport?.cabin_class || '',
          baggage_info: transport?.baggage_info || '',
          // Conteos
          hotels_count: pkg.hotels_count || 0,
          transfers_count: pkg.transfers_count || 0,
          flights_count: pkg.transports_count || 0,
          // Legacy
          includes: buildIncludesString(pkg),
        }

        // Build prompt
        const prompt = buildPrompt(configData.prompt_template, packageData)

        console.log(`[Copy Generate] Generating copy for package ${packageId}...`)

        // Call OpenAI
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          temperature: 0.7,
          max_tokens: 2000,
          messages: [
            {
              role: 'system',
              content: 'Eres un experto en marketing digital para agencias de viajes en Argentina. Genera contenido persuasivo y emocional.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
        })

        const responseContent = completion.choices[0]?.message?.content
        if (!responseContent) {
          throw new Error('Empty response from AI')
        }

        // Parse response
        const parsed = parseAIResponse(responseContent)

        // Validate and truncate if needed
        const variants: AdCopyVariant[] = parsed.variants.map((v) => ({
          variant: v.variant,
          headline: v.headline?.slice(0, 40) || '',
          primary_text: v.primary_text || '',
          description: v.description?.slice(0, 125) || '',
          wa_message_template: v.wa_message_template || `Hola! Me interesa la promo\n.\nPreguntas y respuestas\n1. ¡Hola! Quiero más info de la promo SIV ${pkg.tc_package_id} (no borrar)`,
        }))

        // Save to database (only the requested variants)
        const variantsToReturn: AdCopyVariant[] = []
        for (const variant of variants) {
          // Only save if this variant was requested (or all variants were requested)
          if (variantsToSave.includes(variant.variant)) {
            await db.from('meta_ad_copies').upsert(
              {
                package_id: packageId,
                tc_package_id: pkg.tc_package_id,
                variant: variant.variant,
                headline: variant.headline,
                primary_text: variant.primary_text,
                description: variant.description,
                cta_type: 'SEND_WHATSAPP_MESSAGE',
                wa_message_template: variant.wa_message_template,
                generated_by: 'ai',
                approved: false,
              },
              { onConflict: 'package_id,variant' }
            )
            variantsToReturn.push(variant)
          }
        }

        // Update package marketing status
        await db
          .from('packages')
          .update({ marketing_status: 'copy_generated' })
          .eq('id', packageId)

        results.push({
          package_id: packageId,
          variants: variantsToReturn,
          status: 'success',
        })

        console.log(`[Copy Generate] Generated ${variantsToReturn.length} variants for package ${packageId} (requested: ${variantsToSave.join(', ')})`)
      } catch (error) {
        console.error(`[Copy Generate] Error for package ${packageId}:`, error)
        results.push({
          package_id: packageId,
          variants: [],
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter((r) => r.status === 'success').length

    return NextResponse.json({
      success: successCount > 0,
      results,
      summary: {
        total: packageIds.length,
        success: successCount,
        errors: packageIds.length - successCount,
      },
    })
  } catch (error) {
    console.error('[Copy Generate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error generating copy' },
      { status: 500 }
    )
  }
}

/**
 * Build a string describing what's included in the package
 */
function buildIncludesString(pkg: Record<string, unknown>): string {
  const includes: string[] = []

  if ((pkg.transports_count as number) > 0) includes.push('Vuelo')
  if ((pkg.hotels_count as number) > 0) includes.push('Hotel')
  if ((pkg.transfers_count as number) > 0) includes.push('Traslados')
  if ((pkg.tours_count as number) > 0) includes.push('Tours')
  if ((pkg.tickets_count as number) > 0) includes.push('Excursiones')
  if ((pkg.cars_count as number) > 0) includes.push('Auto')

  return includes.length > 0 ? includes.join(' + ') : 'Paquete completo'
}
