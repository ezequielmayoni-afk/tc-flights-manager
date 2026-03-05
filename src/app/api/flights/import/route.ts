import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getAllTransports, listSuppliers } from '@/lib/travelcompositor/client'
import type { TCTransportWithModalities } from '@/lib/travelcompositor/types'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { tcClient } from '@/lib/travelcompositor/client'


/**
 * GET /api/flights/import
 * Fetch all transports from TravelCompositor for preview
 * Optional query param: supplierId (defaults to TC_SUPPLIER_ID env var)
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const supplierId = searchParams.get('supplierId')

    // Fetch transports from TC (for specific supplier or default)
    let transports: TCTransportWithModalities[]
    if (supplierId) {
      const response = await tcClient.listTransports({ limit: 200 }, supplierId)
      transports = response.transports
    } else {
      transports = await getAllTransports()
    }

    // Get existing flights from DB to compare
    const db = createAdminClient()
    const { data: existingFlights } = await db
      .from('flights')
      .select('tc_transport_id, base_id, name, sync_status')

    const existingMap = new Map(
      (existingFlights || []).map(f => [f.tc_transport_id, f])
    )

    // Enrich transports with local status
    const enrichedTransports = transports.map(transport => ({
      ...transport,
      localFlight: existingMap.get(transport.id) || null,
      syncStatus: existingMap.has(transport.id) ? 'exists' : 'new',
    }))

    return NextResponse.json({
      transports: enrichedTransports,
      total: transports.length,
      existing: existingFlights?.length || 0,
      new: transports.length - (existingFlights?.filter(f =>
        transports.some(t => t.id === f.tc_transport_id)
      ).length || 0),
    })
  } catch (error) {
    console.error('Error fetching transports from TC:', error)
    return errorResponse(error)
  }
}

/**
 * POST /api/flights/import
 * Import selected transports from TC to local DB
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    console.log('[Import POST] Body received:', JSON.stringify(body))
    const {
      transportIds,
      mode = 'sync', // 'sync' = update existing, 'replace' = delete all and reimport
      deleteUnmatched = false, // If true, delete local flights not in TC
      supplierId: bodySupplierId, // Optional: override supplier ID
    } = body as {
      transportIds?: string[]
      mode?: 'sync' | 'replace'
      deleteUnmatched?: boolean
      supplierId?: string
    }

    const db = createAdminClient()

    // Fetch transports from TC (for specific supplier or default)
    let allTransports: TCTransportWithModalities[]
    if (bodySupplierId) {
      const response = await tcClient.listTransports({ limit: 200 }, bodySupplierId)
      allTransports = response.transports
    } else {
      allTransports = await getAllTransports()
    }

    console.log(`[Import] Fetched ${allTransports.length} transports from supplier ${bodySupplierId || 'default'}`)

    // Filter if specific IDs provided
    const transportsToImport = transportIds
      ? allTransports.filter(t => transportIds.includes(t.id))
      : allTransports

    console.log(`[Import] Transports to import: ${transportsToImport.length} (requested IDs: ${transportIds?.length || 'all'})`)

    if (transportsToImport.length === 0) {
      return NextResponse.json({
        error: 'No transports to import',
        message: transportIds
          ? `No se encontraron los transportes seleccionados en el proveedor ${bodySupplierId || 'por defecto'}. Asegurate de seleccionar el proveedor correcto.`
          : 'No se encontraron transportes para importar'
      }, { status: 400 })
    }

    const results = {
      imported: 0,
      updated: 0,
      skipped: 0,
      deleted: 0,
      errors: [] as string[],
    }

    // Use the specified supplier ID, or fall back to env default
    const supplierId = bodySupplierId ? parseInt(bodySupplierId) : parseInt(process.env.TC_SUPPLIER_ID || '0')

    // Ensure the supplier exists in local DB (avoid FK constraint failure)
    if (supplierId) {
      const { data: existingSupplier } = await db
        .from('suppliers')
        .select('id')
        .eq('id', supplierId)
        .single()

      if (!existingSupplier) {
        // Find supplier name from TC
        const tcSuppliers = await listSuppliers()
        const supplierInfo = tcSuppliers.find(s => s.id === supplierId)
        const supplierName = supplierInfo?.name || `Supplier ${supplierId}`

        await db.from('suppliers').upsert({
          id: supplierId,
          name: supplierName,
        })
        console.log(`[Import] Created supplier in local DB: ${supplierId} - ${supplierName}`)
      }
    }

    // If replace mode, delete all existing flights first
    if (mode === 'replace') {
      const { error: deleteError, count } = await db
        .from('flights')
        .delete()
        .not('tc_transport_id', 'is', null)

      if (deleteError) {
        console.error('Error deleting existing flights:', deleteError)
      } else {
        results.deleted = count || 0
        console.log(`[Import] Deleted ${count} existing flights`)
      }
    }

    // Get existing flights for sync mode
    const { data: existingFlights } = await db
      .from('flights')
      .select('id, tc_transport_id, base_id')

    const existingByTcId = new Map(
      (existingFlights || []).map(f => [f.tc_transport_id, f])
    )

    // Import each transport
    for (const transport of transportsToImport) {
      try {
        const existingFlight = existingByTcId.get(transport.id)
        console.log(`[Import] Processing: ${transport.id} (${transport.name}) - exists: ${!!existingFlight}`)

        // Map TC transport to local flight format
        const flightData = mapTransportToFlight(transport, supplierId, user.id)

        if (existingFlight && mode === 'sync') {
          // Update existing flight
          const { error: updateError } = await db
            .from('flights')
            .update({
              ...flightData,
              sync_status: 'synced',
              last_sync_at: new Date().toISOString(),
            })
            .eq('id', existingFlight.id)

          if (updateError) {
            console.error(`[Import] Update error for ${transport.name}:`, updateError)
            results.errors.push(`Error updating ${transport.name}: ${updateError.message}`)
            results.skipped++
          } else {
            // Update segments
            await updateFlightSegments(db, existingFlight.id, transport)
            // Update modality
            await updateFlightModality(db, existingFlight.id, transport)
            results.updated++
            console.log(`[Import] Updated: ${transport.name}`)
          }
        } else {
          // Create new flight with direct inserts
          console.log(`[Import] Creating new flight: ${transport.name} with supplier_id: ${supplierId}`)

          const { data: newFlight, error: insertError } = await db
            .from('flights')
            .insert({
              ...flightData,
              sync_status: 'synced',
              last_sync_at: new Date().toISOString(),
            })
            .select('id')
            .single()

          if (insertError || !newFlight) {
            const errorMsg = insertError?.message || 'Unknown error'
            console.error(`[Import] FAILED importing ${transport.name}: ${errorMsg}`)
            results.errors.push(`Error importing ${transport.name}: ${errorMsg}`)
            results.skipped++
          } else {
            // Create segments and modality
            await createFlightSegments(db, newFlight.id, transport)
            await createFlightModality(db, newFlight.id, transport)
            results.imported++
            console.log(`[Import] SUCCESS: ${transport.name} (flight_id: ${newFlight.id})`)
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error'
        console.error(`[Import] EXCEPTION processing ${transport.name}:`, errorMsg)
        results.errors.push(`Error processing ${transport.name}: ${errorMsg}`)
        results.skipped++
      }
    }

    // Optionally delete flights that don't exist in TC
    if (deleteUnmatched && mode === 'sync') {
      const tcIds = new Set(transportsToImport.map(t => t.id))
      const flightsToDelete = (existingFlights || [])
        .filter(f => f.tc_transport_id && !tcIds.has(f.tc_transport_id))
        .map(f => f.id)

      if (flightsToDelete.length > 0) {
        const { error: deleteError, count } = await db
          .from('flights')
          .delete()
          .in('id', flightsToDelete)

        if (!deleteError) {
          results.deleted = count || 0
        }
      }
    }

    console.log(`[Import] DONE: imported=${results.imported}, updated=${results.updated}, skipped=${results.skipped}, errors=${results.errors.length}`)
    if (results.errors.length > 0) {
      console.log(`[Import] Errors:`, results.errors)
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Importación completada: ${results.imported} importados, ${results.updated} actualizados, ${results.deleted} eliminados, ${results.skipped} omitidos`,
    })
  } catch (error) {
    console.error('[Import] FATAL ERROR:', error)
    return errorResponse(error)
  }
}

/**
 * Map TC transport to local flight format
 */
function mapTransportToFlight(
  transport: TCTransportWithModalities,
  supplierId: number,
  userId: string
): Record<string, unknown> {
  // Get name from datasheets or fallback to transport name
  const name = transport.datasheets?.ES?.name || transport.name || transport.baseId

  return {
    base_id: transport.baseId || transport.id || name,
    tc_transport_id: transport.id,
    name,
    airline_code: transport.airlineCode || '',
    transport_type: transport.transportType,
    active: transport.active,
    price_per_pax: transport.pricePerPax ?? true,
    currency: transport.currency || 'USD',
    // OW Prices
    base_adult_price: transport.baseAdultPrice || 0,
    base_children_price: transport.baseChildrenPrice || 0,
    base_infant_price: transport.baseInfantPrice || 0,
    // RT Prices
    base_adult_rt_price: transport.baseAdultRTPrice || 0,
    base_children_rt_price: transport.baseChildrenRTPrice || 0,
    base_infant_rt_price: transport.baseInfantRTPrice || 0,
    // OW Taxes
    adult_taxes_amount: transport.adultTaxesAmount || 0,
    children_taxes_amount: transport.childrenTaxesAmount || 0,
    infant_taxes_amount: transport.infantTaxesAmount || 0,
    // RT Taxes
    adult_rt_taxes_amount: transport.adultRTTaxesAmount || 0,
    children_rt_taxes_amount: transport.childrenRTTaxesAmount || 0,
    infant_rt_taxes_amount: transport.infantRTTaxesAmount || 0,
    // Dates
    start_date: transport.startDate,
    end_date: transport.endDate,
    // Config
    operational_days: transport.operationalDays || [],
    product_types: transport.productTypes || [],
    allow_ow_price: transport.allowOWPrice ?? true,
    allow_rt_price: transport.allowRTPrice ?? true,
    release_contract: transport.releaseContract || 0,
    // Age limits
    min_child_age: transport.minChildAge || 2,
    max_child_age: transport.maxChildAge || 11,
    min_infant_age: transport.minInfantAge || 0,
    max_infant_age: transport.maxInfantAge || 1,
    // Relations
    supplier_id: supplierId,
    created_by: userId,
  }
}

/**
 * Create flight segments from TC transport
 */
async function createFlightSegments(
  db: ReturnType<typeof createAdminClient>,
  flightId: number,
  transport: TCTransportWithModalities
) {
  if (!transport.segments || transport.segments.length === 0) return

  const segments = transport.segments.map((segment, index) => ({
    flight_id: flightId,
    departure_location_code: segment.departureLocationCode,
    arrival_location_code: segment.arrivalLocationCode,
    departure_time: segment.departureTime,
    arrival_time: segment.arrivalTime,
    plus_days: segment.plusDays || 0,
    duration_time: segment.durationTime,
    model: segment.model || '',
    num_service: segment.numService || '',
    sort_order: index,
  }))

  await db.from('flight_segments').insert(segments)
}

/**
 * Update flight segments (delete old, create new)
 */
async function updateFlightSegments(
  db: ReturnType<typeof createAdminClient>,
  flightId: number,
  transport: TCTransportWithModalities
) {
  // Delete existing segments
  await db.from('flight_segments').delete().eq('flight_id', flightId)
  // Create new segments
  await createFlightSegments(db, flightId, transport)
}

/**
 * Create flight modality from TC transport
 */
async function createFlightModality(
  db: ReturnType<typeof createAdminClient>,
  flightId: number,
  transport: TCTransportWithModalities
) {
  if (!transport.modalities || transport.modalities.length === 0) return

  // Use first modality
  const modality = transport.modalities[0]

  const modalityData = {
    flight_id: flightId,
    code: modality.code,
    active: modality.active,
    cabin_class_type: modality.cabinClassType || 'ECONOMY',
    baggage_allowance: modality.baggageAllowance?.toString() || '0',
    baggage_allowance_type: modality.baggageAllowanceType || 'KG',
    min_passengers: modality.minPassengers || 1,
    max_passengers: modality.maxPassengers || 9,
    on_request: modality.onRequest || false,
  }

  const { data: createdModality, error } = await db
    .from('modalities')
    .insert(modalityData)
    .select()
    .single()

  if (error) {
    console.error('Error creating modality:', error)
    return
  }

  // Create inventories
  if (modality.inventories && modality.inventories.length > 0 && createdModality) {
    const inventories = modality.inventories.map(inv => ({
      modality_id: createdModality.id,
      start_date: inv.inventoryDate.start,
      end_date: inv.inventoryDate.end,
      quantity: inv.quantity,
      sold: 0,
    }))

    await db.from('modality_inventories').insert(inventories)
  }
}

/**
 * Update flight modality (delete old, create new)
 */
async function updateFlightModality(
  db: ReturnType<typeof createAdminClient>,
  flightId: number,
  transport: TCTransportWithModalities
) {
  // Get existing modalities
  const { data: existingModalities } = await db
    .from('modalities')
    .select('id')
    .eq('flight_id', flightId)

  // Delete existing inventories and modalities
  if (existingModalities && existingModalities.length > 0) {
    const modalityIds = existingModalities.map(m => m.id)
    await db.from('modality_inventories').delete().in('modality_id', modalityIds)
    await db.from('modalities').delete().eq('flight_id', flightId)
  }

  // Create new modality
  await createFlightModality(db, flightId, transport)
}

/**
 * DELETE /api/flights/import
 * Delete all local flights (for testing/reset purposes)
 */
export async function DELETE() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = await createClient()

  // Verify authentication
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const db = createAdminClient()

    // Count before delete
    const { count: beforeCount } = await db
      .from('flights')
      .select('*', { count: 'exact', head: true })

    // Delete all flights (cascades to segments, modalities, etc.)
    const { error } = await db.from('flights').delete().neq('id', 0)

    if (error) {
      return errorResponse(error)
    }

    return NextResponse.json({
      success: true,
      deleted: beforeCount || 0,
      message: `Se eliminaron ${beforeCount || 0} vuelos de la base de datos local`,
    })
  } catch (error) {
    console.error('Error deleting flights:', error)
    return errorResponse(error)
  }
}
