import { NextRequest, NextResponse } from 'next/server'
import { getAllPackagesExcludingUsers, getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import {
  EXCLUDED_USERS,
  extractCosts,
  mapPackageToInsert,
  importPackageDestinations,
  importPackageTransports,
  importPackageHotels,
} from '@/lib/packages/import'
import type { TCPackageListItem, TCPackageInfoResponse, TCPackageDetailResponse } from '@/lib/travelcompositor/types'
import { generateSEOContent, type PackageDataForSEO } from '@/lib/openai/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

interface ImportStats {
  total: number
  imported: number
  updated: number
  skipped: number
  errors: number
  errorDetails: Array<{ id: number; title: string; error: string }>
}

/**
 * POST /api/packages/import
 * Import all packages from Marcelo Dore from TravelCompositor
 *
 * Options:
 * - fullSync: boolean - If true, fetches full details for each package (slower but more complete)
 * - forceUpdate: boolean - If true, updates existing packages even if they exist
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    // Parse options from request body
    const body = await request.json().catch(() => ({}))
    const fullSync = body.fullSync !== false // Default to true now
    const forceUpdate = body.forceUpdate === true

    console.log(`[Import] Starting import (excluding users: ${EXCLUDED_USERS.join(', ')})`)
    console.log(`[Import] Options: fullSync=${fullSync}, forceUpdate=${forceUpdate}`)

    // Fetch all ACTIVE packages from TC, excluding specified users
    const tcPackages = await getAllPackagesExcludingUsers(EXCLUDED_USERS, { onlyVisible: true })
    console.log(`[Import] Found ${tcPackages.length} packages from TC`)

    // Get existing packages from our DB
    const { data: existingPackages } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax')

    const existingByTcId = new Map<number, { id: number; current_price_per_pax: number }>(
      (existingPackages || []).map(p => [p.tc_package_id, { id: p.id, current_price_per_pax: p.current_price_per_pax }])
    )

    const stats: ImportStats = {
      total: tcPackages.length,
      imported: 0,
      updated: 0,
      skipped: 0,
      errors: 0,
      errorDetails: [],
    }

    // Process each package
    for (const tcPackage of tcPackages) {
      try {
        const existing = existingByTcId.get(tcPackage.id)

        // Fetch additional info for full sync
        let info: TCPackageInfoResponse | undefined
        let detail: TCPackageDetailResponse | undefined
        let costs: ReturnType<typeof extractCosts> | undefined

        if (fullSync) {
          try {
            // Sequential calls: first info, then detail (only if info succeeds)
            info = await getPackageInfo(tcPackage.id)
            if (info) {
              detail = await getPackageDetail(tcPackage.id)
              if (detail) {
                costs = extractCosts(detail)
              }
            }
          } catch (err) {
            console.warn(`[Import] Could not fetch full details for ${tcPackage.id}:`, err)
          }
        }

        if (existing && !forceUpdate) {
          // Package exists, check if price changed
          const oldPrice = existing.current_price_per_pax
          const newPrice = tcPackage.pricePerPerson.amount

          if (oldPrice !== newPrice) {
            // Calculate variance
            const varianceAmount = newPrice - oldPrice
            const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
            const needsManualQuote = Math.abs(variancePct) >= 10

            // Update package with new price, variance, and additional info
            const updateData: Record<string, unknown> = {
              original_price_per_pax: oldPrice,
              current_price_per_pax: newPrice,
              total_price: tcPackage.totalPrice.amount,
              price_variance_pct: variancePct,
              needs_manual_quote: needsManualQuote,
              tc_active: tcPackage.active,
              last_sync_at: new Date().toISOString(),
            }

            // Add full sync data if available
            if (info?.dateSettings?.availRange) {
              updateData.date_range_start = info.dateSettings.availRange.start
              updateData.date_range_end = info.dateSettings.availRange.end
            }
            if (costs) {
              updateData.air_cost = costs.airCost
              updateData.land_cost = costs.landCost
              updateData.agency_fee = costs.agencyFee
              updateData.flight_departure_date = costs.flightDepartureDate
              updateData.airline_code = costs.airlineCode
              updateData.airline_name = costs.airlineName
              updateData.flight_numbers = costs.flightNumbers
            }

            await db
              .from('packages')
              .update(updateData)
              .eq('id', existing.id)

            // Record price history
            await db.from('package_price_history').insert({
              package_id: existing.id,
              price_per_pax: newPrice,
              total_price: tcPackage.totalPrice.amount,
              currency: tcPackage.pricePerPerson.currency || 'USD',
              previous_price: oldPrice,
              variance_amount: varianceAmount,
              variance_pct: variancePct,
            })

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.updated++
            console.log(`[Import] Updated package ${tcPackage.id}: price changed from ${oldPrice} to ${newPrice} (${variancePct.toFixed(2)}%)`)
          } else {
            // Just update sync info and additional data
            const updateData: Record<string, unknown> = {
              tc_active: tcPackage.active,
              last_sync_at: new Date().toISOString(),
            }

            if (info?.dateSettings?.availRange) {
              updateData.date_range_start = info.dateSettings.availRange.start
              updateData.date_range_end = info.dateSettings.availRange.end
            }
            if (costs) {
              updateData.air_cost = costs.airCost
              updateData.land_cost = costs.landCost
              updateData.agency_fee = costs.agencyFee
              updateData.flight_departure_date = costs.flightDepartureDate
              updateData.airline_code = costs.airlineCode
              updateData.airline_name = costs.airlineName
              updateData.flight_numbers = costs.flightNumbers
            }

            await db
              .from('packages')
              .update(updateData)
              .eq('id', existing.id)

            // Import transports and hotels if detail available (even if price didn't change)
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.skipped++
          }
        } else {
          // New package or force update
          const packageData = mapPackageToInsert(tcPackage, info, costs)

          if (existing && forceUpdate) {
            // Update existing package
            await db
              .from('packages')
              .update(packageData)
              .eq('id', existing.id)

            // Update destinations
            await importPackageDestinations(db, existing.id, tcPackage.destinations)

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, existing.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            stats.updated++
            console.log(`[Import] Force updated package ${tcPackage.id}: ${tcPackage.title}`)
          } else {
            // Insert new package
            packageData.original_price_per_pax = tcPackage.pricePerPerson.amount
            packageData.status = 'imported'

            const { data: newPackage, error: insertError } = await db
              .from('packages')
              .insert(packageData)
              .select('id')
              .single()

            if (insertError) {
              throw new Error(insertError.message)
            }

            // Import destinations
            await importPackageDestinations(db, newPackage.id, tcPackage.destinations)

            // Import transports and hotels if detail available
            if (detail) {
              await importPackageTransports(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
              await importPackageHotels(db, newPackage.id, detail, tcPackage.counters.adults, tcPackage.counters.children)
            }

            // Record initial price history
            await db.from('package_price_history').insert({
              package_id: newPackage.id,
              price_per_pax: tcPackage.pricePerPerson.amount,
              total_price: tcPackage.totalPrice.amount,
              currency: tcPackage.pricePerPerson.currency || 'USD',
            })

            // Generate SEO content for new packages
            try {
              const { data: configData } = await db
                .from('seo_prompt_config')
                .select('prompt_template')
                .order('id', { ascending: false })
                .limit(1)
                .single()

              if (configData?.prompt_template) {
                const destinationNames = tcPackage.destinations?.map(d => d.name).join(', ') || ''
                // Note: TCPackageListItem doesn't include hotel/transport details
                // Those would need to be fetched separately via package detail endpoint
                const seoPackageData: PackageDataForSEO = {
                  // Basic info
                  title: tcPackage.title,
                  large_title: tcPackage.largeTitle || null,
                  destinations: destinationNames,
                  price: tcPackage.pricePerPerson.amount,
                  currency: tcPackage.pricePerPerson.currency || 'USD',
                  nights: tcPackage.counters?.hotelNights || 0,
                  adults: tcPackage.counters?.adults || 2,
                  children: tcPackage.counters?.children || 0,
                  departure_date: tcPackage.departureDate || null,
                  date_range: null, // Not available in list endpoint
                  themes: tcPackage.themes || [],
                  // Origin
                  origin_city: tcPackage.origin?.location?.name || null,
                  origin_country: tcPackage.origin?.location?.country || null,
                  // Hotel info (not available in list endpoint)
                  hotel_name: null,
                  hotel_category: null,
                  hotel_stars: null,
                  room_type: null,
                  board_type: null,
                  hotel_nights: tcPackage.counters?.hotelNights || null,
                  hotel_address: null,
                  // Flight info
                  airline: costs?.airlineName || null,
                  airline_code: null,
                  flight_departure: null,
                  flight_arrival: null,
                  cabin_class: null,
                  baggage_info: null,
                  // Counts
                  hotels_count: tcPackage.counters?.hotels || 0,
                  transfers_count: tcPackage.counters?.transfers || 0,
                  flights_count: tcPackage.counters?.transports || 0,
                  // Inclusions
                  includes_flights: (tcPackage.counters?.transports || 0) > 0,
                  includes_hotel: (tcPackage.counters?.hotels || 0) > 0,
                  includes_transfers: (tcPackage.counters?.transfers || 0) > 0,
                  includes_all_inclusive: false, // Not determinable from list endpoint
                }

                const seoContent = await generateSEOContent(seoPackageData, configData.prompt_template)

                await db
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
                  })
                  .eq('id', newPackage.id)
              }
            } catch (seoError) {
              console.warn(`[Import] SEO generation failed for ${tcPackage.id}:`, seoError)
            }

            stats.imported++
            console.log(`[Import] Imported new package ${tcPackage.id}: ${tcPackage.title}`)
          }
        }
      } catch (error) {
        stats.errors++
        stats.errorDetails.push({
          id: tcPackage.id,
          title: tcPackage.title,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
        console.error(`[Import] Error processing package ${tcPackage.id}:`, error)
      }
    }

    console.log(`[Import] Complete. Imported: ${stats.imported}, Updated: ${stats.updated}, Skipped: ${stats.skipped}, Errors: ${stats.errors}`)

    return NextResponse.json({
      success: true,
      message: `Import completed (excluded: ${EXCLUDED_USERS.join(', ')})`,
      stats,
    })
  } catch (error) {
    console.error('[Import] Fatal error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/packages/import
 * Get import status and stats
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('productos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    // Get counts and stats
    const { count: totalCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })

    const { count: activeCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('tc_active', true)

    const { count: needsQuoteCount } = await db
      .from('packages')
      .select('*', { count: 'exact', head: true })
      .eq('needs_manual_quote', true)

    const { data: lastSync } = await db
      .from('packages')
      .select('last_sync_at')
      .order('last_sync_at', { ascending: false })
      .limit(1)
      .single()

    // Get packages by status
    const { data: statusCounts } = await db
      .from('packages')
      .select('status')

    const statusBreakdown = (statusCounts || []).reduce((acc, p) => {
      acc[p.status] = (acc[p.status] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    return NextResponse.json({
      excludedUsers: EXCLUDED_USERS,
      stats: {
        total: totalCount || 0,
        active: activeCount || 0,
        needsManualQuote: needsQuoteCount || 0,
        lastSyncAt: lastSync?.last_sync_at || null,
        byStatus: statusBreakdown,
      },
    })
  } catch (error) {
    console.error('[Import] Error getting stats:', error)
    return errorResponse(error)
  }
}
