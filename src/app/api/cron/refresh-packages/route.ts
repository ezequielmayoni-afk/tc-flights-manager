import { NextRequest, NextResponse } from 'next/server'
import { getPackageInfo, getPackageDetail } from '@/lib/travelcompositor/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractCosts, importNewPackages } from '@/lib/packages/import'

// Vercel cron jobs have a 60s timeout on hobby, 300s on pro
export const maxDuration = 300

// Cuántos paquetes ya existentes se refrescan por corrida y cuántos nuevos se
// importan como máximo, para no pasarnos del límite de la función.
const BATCH_SIZE = 60
const IMPORT_LIMIT = 25
const DELAY_BETWEEN_PACKAGES = 250 // ms
// Margen de seguridad: dejamos de procesar al acercarnos al maxDuration.
const TIME_BUDGET_MS = 260_000


async function refreshPackage(db: ReturnType<typeof createAdminClient>, pkg: {
  id: number
  tc_package_id: number
  current_price_per_pax: number
}): Promise<{ success: boolean; priceChanged: boolean; error?: string }> {
  try {
    const [info, detail] = await Promise.all([
      getPackageInfo(pkg.tc_package_id),
      getPackageDetail(pkg.tc_package_id),
    ])

    if (!info) {
      return { success: false, priceChanged: false, error: 'Package not found in TC' }
    }

    const tcPackage = info
    const costs = extractCosts(detail)
    const oldPrice = pkg.current_price_per_pax
    const newPrice = tcPackage.pricePerPerson.amount

    // Calculate price variance
    const varianceAmount = newPrice - oldPrice
    const variancePct = oldPrice > 0 ? ((varianceAmount / oldPrice) * 100) : 0
    const needsManualQuote = Math.abs(variancePct) >= 5

    // Prepare update data
    const updateData: Record<string, unknown> = {
      title: tcPackage.title,
      large_title: tcPackage.largeTitle || null,
      image_url: tcPackage.imageUrl || null,
      departure_date: tcPackage.departureDate || null,
      date_range_start: tcPackage.dateSettings?.availRange?.start || null,
      date_range_end: tcPackage.dateSettings?.availRange?.end || null,
      current_price_per_pax: newPrice,
      total_price: tcPackage.totalPrice.amount,
      currency: tcPackage.pricePerPerson.currency || 'USD',
      price_variance_pct: oldPrice !== newPrice ? variancePct : null,
      needs_manual_quote: oldPrice !== newPrice ? needsManualQuote : false,
      // Counters
      adults_count: tcPackage.counters.adults,
      children_count: tcPackage.counters.children,
      nights_count: tcPackage.counters.hotelNights,
      destinations_count: tcPackage.counters.destinations,
      transports_count: tcPackage.counters.transports,
      hotels_count: tcPackage.counters.hotels,
      transfers_count: tcPackage.counters.transfers,
      cars_count: tcPackage.counters.cars,
      tickets_count: tcPackage.counters.tickets,
      tours_count: tcPackage.counters.closedTours,
      // Status
      tc_active: tcPackage.active,
      themes: tcPackage.themes || [],
      tc_idea_url: tcPackage.ideaUrl || null,
      // Cost breakdown
      air_cost: costs.airCost,
      land_cost: costs.landCost,
      agency_fee: costs.agencyFee,
      flight_departure_date: costs.flightDepartureDate,
      airline_code: costs.airlineCode,
      airline_name: costs.airlineName,
      flight_numbers: costs.flightNumbers,
      // Sync timestamp
      last_sync_at: new Date().toISOString(),
    }

    // If price changed, record original price, timestamp and history
    if (oldPrice !== newPrice) {
      updateData.original_price_per_pax = oldPrice
      updateData.last_price_change_at = new Date().toISOString()

      await db.from('package_price_history').insert({
        package_id: pkg.id,
        price_per_pax: newPrice,
        total_price: tcPackage.totalPrice.amount,
        currency: tcPackage.pricePerPerson.currency || 'USD',
        previous_price: oldPrice,
        variance_amount: varianceAmount,
        variance_pct: variancePct,
      })
    }

    // Update package
    const { error: updateError } = await db
      .from('packages')
      .update(updateData)
      .eq('id', pkg.id)

    if (updateError) {
      return { success: false, priceChanged: false, error: updateError.message }
    }

    // Update destinations
    if (tcPackage.destinations && tcPackage.destinations.length > 0) {
      await db.from('package_destinations').delete().eq('package_id', pkg.id)

      const destinationsToInsert = tcPackage.destinations.map((dest, index) => ({
        package_id: pkg.id,
        destination_code: dest.code,
        destination_name: dest.name,
        sort_order: index,
      }))

      await db.from('package_destinations').insert(destinationsToInsert)
    }

    return { success: true, priceChanged: oldPrice !== newPrice }
  } catch (error) {
    return {
      success: false,
      priceChanged: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * GET /api/cron/refresh-packages
 * Cron job to refresh all active packages from TravelCompositor
 * Runs daily at 6:00 AM UTC (3:00 AM Argentina time)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  // FIX: Si CRON_SECRET no está configurado, rechazar (antes se bypasseaba)
  if (!cronSecret) {
    console.error('[Cron] CRON_SECRET no configurado')
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Cron] Intento de acceso no autorizado', {
      ip: request.headers.get('x-forwarded-for') || 'unknown',
    })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()
  const startTime = Date.now()

  console.log('[Cron] Starting daily package sync...')

  const outOfTime = () => Date.now() - startTime > TIME_BUDGET_MS

  // 1) Importar los paquetes que están en TC y todavía no existen en hub.
  //    Sin SEO: entran con seo_status 'pending' para completarlos a mano.
  let newPackages
  try {
    newPackages = await importNewPackages(db, { limit: IMPORT_LIMIT, shouldStop: outOfTime })
    console.log(`[Cron] Nuevos en TC: ${newPackages.detected}, importados: ${newPackages.imported}`)

    if (newPackages.imported > 0 || newPackages.errors.length > 0) {
      await db.from('package_sync_logs').insert({
        package_id: null,
        sync_type: 'cron_import_new',
        status: newPackages.errors.length === 0 ? 'success' : 'partial',
        details: {
          tcTotal: newPackages.tcTotal,
          detected: newPackages.detected,
          imported: newPackages.imported,
          errors: newPackages.errors,
        },
      })
    }
  } catch (error) {
    console.error('[Cron] Error importando paquetes nuevos:', error)
    newPackages = {
      tcTotal: 0,
      detected: 0,
      imported: 0,
      errors: [{ id: 0, title: 'import', error: error instanceof Error ? error.message : 'Unknown error' }],
    }
  }

  // 2) Refrescar precios/costos de los paquetes ya cargados
  try {
    // Get all active packages that haven't expired
    const today = new Date().toISOString().split('T')[0]
    const { data: packages, error: fetchError } = await db
      .from('packages')
      .select('id, tc_package_id, current_price_per_pax')
      .eq('tc_active', true)
      .or(`date_range_end.is.null,date_range_end.gte.${today}`)
      .order('last_sync_at', { ascending: true, nullsFirst: true })
      .limit(BATCH_SIZE)

    if (fetchError) {
      console.error('[Cron] Error fetching packages:', fetchError)
      return NextResponse.json({ error: fetchError.message }, { status: 500 })
    }

    if (!packages || packages.length === 0) {
      console.log('[Cron] No packages to refresh')
      return NextResponse.json({
        success: true,
        message: 'No packages to refresh',
        newPackages,
        processed: 0,
      })
    }

    console.log(`[Cron] Processing ${packages.length} packages...`)

    const results = {
      processed: 0,
      successCount: 0,
      failed: 0,
      priceChanges: 0,
      errors: [] as { id: number; tc_id: number; error: string }[],
    }

    for (const pkg of packages) {
      if (outOfTime()) {
        console.warn(`[Cron] Corte por tiempo tras ${results.processed} paquetes`)
        break
      }

      const result = await refreshPackage(db, pkg)
      results.processed++

      if (result.success) {
        results.successCount++
        if (result.priceChanged) {
          results.priceChanges++
        }
      } else {
        results.failed++
        results.errors.push({
          id: pkg.id,
          tc_id: pkg.tc_package_id,
          error: result.error || 'Unknown error',
        })

        // Un paquete que falla no debe taponar la cola: el orden es por
        // last_sync_at y si nunca se actualiza queda primero para siempre.
        // Si TC dice que ya no existe, además lo damos de baja.
        const goneFromTC = (result.error || '').includes('404')
        await db
          .from('packages')
          .update({
            last_sync_at: new Date().toISOString(),
            ...(goneFromTC ? { tc_active: false } : {}),
          })
          .eq('id', pkg.id)
      }

      // Add delay between packages to avoid rate limiting
      if (results.processed < packages.length) {
        await sleep(DELAY_BETWEEN_PACKAGES)
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)
    console.log(`[Cron] Completed in ${duration}s: ${results.successCount}/${results.processed} success, ${results.priceChanges} price changes`)

    // Log to sync_logs table
    await db.from('package_sync_logs').insert({
      package_id: null,
      sync_type: 'cron_batch',
      status: results.failed === 0 ? 'success' : 'partial',
      details: {
        newPackagesDetected: newPackages.detected,
        newPackagesImported: newPackages.imported,
        processed: results.processed,
        successCount: results.successCount,
        failed: results.failed,
        priceChanges: results.priceChanges,
        duration: `${duration}s`,
        errors: results.errors,
      },
    })

    return NextResponse.json({
      success: results.failed === 0 && newPackages.errors.length === 0,
      newPackages,
      ...results,
      duration: `${duration}s`,
    })
  } catch (error) {
    console.error('[Cron] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// Also support POST for manual triggers
export { GET as POST }
