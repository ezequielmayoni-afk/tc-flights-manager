import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { generateSEOContent, type PackageDataForSEO } from '@/lib/openai/client'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/seo/generate
 * Generate SEO content for selected packages using OpenAI
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const { packageIds } = await request.json()

    if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
      return NextResponse.json({ error: 'No packages selected' }, { status: 400 })
    }

    // Get prompt template
    const { data: promptConfig } = await db
      .from('seo_prompt_config')
      .select('prompt_template')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (!promptConfig?.prompt_template) {
      return NextResponse.json({ error: 'No prompt template configured' }, { status: 500 })
    }

    // Get package details with all related data for SEO
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select(`
        id,
        tc_package_id,
        title,
        large_title,
        current_price_per_pax,
        currency,
        nights_count,
        adults_count,
        children_count,
        departure_date,
        date_range_start,
        date_range_end,
        airline_name,
        airline_code,
        origin_name,
        origin_country,
        hotels_count,
        transfers_count,
        transports_count,
        themes,
        package_destinations(destination_name),
        package_hotels(hotel_name, hotel_category, room_type, board_type, nights, address, stars),
        package_transports(departure_date, arrival_date, cabin_class, baggage_info, checked_baggage)
      `)
      .in('id', packageIds)

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    const results: Array<{
      id: number
      tc_package_id: number
      title: string
      status: 'success' | 'error'
      error?: string
    }> = []

    // Process each package
    for (const pkg of packages || []) {
      try {
        // Prepare package data for SEO generation
        const destinations = pkg.package_destinations
          ?.map((d: { destination_name: string }) => d.destination_name)
          .join(', ') || ''

        // Get first hotel info
        const firstHotel = pkg.package_hotels?.[0] as any
        const boardType = firstHotel?.board_type || ''
        const isAllInclusive = boardType.toUpperCase().includes('ALL INCLUSIVE') ||
          boardType.toUpperCase().includes('TODO INCLUIDO')

        // Get first transport info
        const firstTransport = pkg.package_transports?.[0] as any

        // Build date range
        const dateRange = pkg.date_range_start && pkg.date_range_end
          ? `${pkg.date_range_start} - ${pkg.date_range_end}`
          : null

        const packageData: PackageDataForSEO = {
          // Basic info
          title: pkg.title,
          large_title: pkg.large_title,
          destinations,
          price: pkg.current_price_per_pax || 0,
          currency: pkg.currency || 'USD',
          nights: pkg.nights_count || 0,
          adults: pkg.adults_count || 2,
          children: pkg.children_count || 0,
          departure_date: pkg.departure_date,
          date_range: dateRange,
          themes: pkg.themes || [],

          // Origin
          origin_city: pkg.origin_name || null,
          origin_country: pkg.origin_country || null,

          // Hotel info
          hotel_name: firstHotel?.hotel_name || null,
          hotel_category: firstHotel?.hotel_category || null,
          hotel_stars: firstHotel?.stars || null,
          room_type: firstHotel?.room_type || null,
          board_type: boardType || null,
          hotel_nights: firstHotel?.nights || null,
          hotel_address: firstHotel?.address || null,

          // Flight info
          airline: pkg.airline_name || null,
          airline_code: pkg.airline_code || null,
          flight_departure: firstTransport?.departure_date || null,
          flight_arrival: firstTransport?.arrival_date || null,
          cabin_class: firstTransport?.cabin_class || null,
          baggage_info: firstTransport?.baggage_info || firstTransport?.checked_baggage || null,

          // Counts
          hotels_count: pkg.hotels_count || 0,
          transfers_count: pkg.transfers_count || 0,
          flights_count: pkg.transports_count || 0,

          // Inclusions
          includes_flights: (pkg.transports_count || 0) > 0,
          includes_hotel: (pkg.hotels_count || 0) > 0,
          includes_transfers: (pkg.transfers_count || 0) > 0,
          includes_all_inclusive: isAllInclusive,
        }

        // Generate SEO content
        const seoContent = await generateSEOContent(packageData, promptConfig.prompt_template)

        // Update package with SEO content
        const { error: updateError } = await db
          .from('packages')
          .update({
            seo_title: seoContent.seo_title,
            seo_description: seoContent.seo_description,
            seo_keywords: seoContent.seo_keywords,
            meta_title: seoContent.meta_title,
            meta_description: seoContent.meta_description,
            image_alt: seoContent.image_alt,
            seo_status: 'generated',
            seo_generated_at: new Date().toISOString(),
            seo_uploaded_to_tc: false,  // Reset so bot will re-upload
          })
          .eq('id', pkg.id)

        if (updateError) {
          results.push({
            id: pkg.id,
            tc_package_id: pkg.tc_package_id,
            title: pkg.title,
            status: 'error',
            error: updateError.message,
          })
        } else {
          results.push({
            id: pkg.id,
            tc_package_id: pkg.tc_package_id,
            title: pkg.title,
            status: 'success',
          })
        }
      } catch (error) {
        results.push({
          id: pkg.id,
          tc_package_id: pkg.tc_package_id,
          title: pkg.title,
          status: 'error',
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    const successCount = results.filter(r => r.status === 'success').length
    const errorCount = results.filter(r => r.status === 'error').length

    console.log(`[SEO Generate] ${successCount} success, ${errorCount} errors`)

    return NextResponse.json({
      success: errorCount === 0,
      generated: successCount,
      errors: errorCount,
      results,
    })
  } catch (error) {
    console.error('[SEO Generate] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
