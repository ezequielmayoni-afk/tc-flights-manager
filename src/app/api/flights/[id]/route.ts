import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { flightFormSchema } from '@/lib/validations/flight'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

type RouteParams = { params: Promise<{ id: string }> }

// Cliente sin tipos para operaciones complejas
function getUntypedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Helper para calcular end_date basándose en plus_days de los segmentos
function calculateEndDate(startDate: string, segments: Array<{ plus_days?: number }>): string {
  const maxPlusDays = Math.max(0, ...segments.map(s => s.plus_days || 0))

  if (maxPlusDays === 0) {
    return startDate
  }

  const [year, month, day] = startDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + maxPlusDays)

  const newYear = date.getFullYear()
  const newMonth = String(date.getMonth() + 1).padStart(2, '0')
  const newDay = String(date.getDate()).padStart(2, '0')

  return `${newYear}-${newMonth}-${newDay}`
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  const { data: flight, error } = await supabase
    .from('flights')
    .select(`
      *,
      flight_segments(*),
      flight_datasheets(*),
      flight_cancellations(*),
      modalities(*, modality_inventories(*))
    `)
    .eq('id', id)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 404 })
  }

  return NextResponse.json(flight)
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()

  // Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const validatedData = flightFormSchema.parse(body)

    // Extraer relaciones y fechas por tramo
    const {
      segments,
      datasheets,
      cancellations,
      modality,
      outbound_date,
      return_date,
      outbound_operational_days,
      return_operational_days,
      ...flightData
    } = validatedData

    const db = getUntypedClient()

    // Obtener el leg_type del vuelo actual
    const { data: existingFlight } = await db
      .from('flights')
      .select('leg_type, paired_flight_id')
      .eq('id', id)
      .single()

    const currentLegType = existingFlight?.leg_type || 'outbound'

    // Determinar qué fecha y días operacionales usar según el leg_type
    const legDate = currentLegType === 'outbound' ? outbound_date : return_date
    const legOperationalDays = currentLegType === 'outbound' ? outbound_operational_days : return_operational_days

    // Filtrar segmentos del tramo correspondiente
    const legSegments = segments.filter(s => s.leg_type === currentLegType)

    // Calcular start_date y end_date
    const start_date = legDate
    const end_date = calculateEndDate(legDate, legSegments)

    // Actualizar el vuelo
    const updateData = {
      ...flightData,
      start_date,
      end_date,
      operational_days: legOperationalDays,
      sync_status: 'modified',
      updated_at: new Date().toISOString(),
    }

    const { data: flight, error: flightError } = await db
      .from('flights')
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (flightError) {
      console.error('Error updating flight:', flightError)
      return NextResponse.json({ error: flightError.message }, { status: 500 })
    }

    // Eliminar y recrear segmentos (solo del tramo correspondiente)
    await db.from('flight_segments').delete().eq('flight_id', id)
    if (legSegments.length > 0) {
      const segmentsWithFlightId = legSegments.map((segment, index) => ({
        ...segment,
        flight_id: parseInt(id),
        sort_order: index,
      }))

      const { error: segmentsError } = await db
        .from('flight_segments')
        .insert(segmentsWithFlightId)

      if (segmentsError) {
        console.error('Error updating segments:', segmentsError)
      }
    }

    // Eliminar y recrear datasheets
    await db.from('flight_datasheets').delete().eq('flight_id', id)
    if (datasheets.length > 0) {
      const datasheetsWithFlightId = datasheets.map(ds => ({
        ...ds,
        flight_id: parseInt(id),
      }))

      const { error: dsError } = await db
        .from('flight_datasheets')
        .insert(datasheetsWithFlightId)

      if (dsError) {
        console.error('Error updating datasheets:', dsError)
      }
    }

    // Eliminar y recrear cancellations
    await db.from('flight_cancellations').delete().eq('flight_id', id)
    if (cancellations.length > 0) {
      const cancellationsWithFlightId = cancellations.map(c => ({
        ...c,
        flight_id: parseInt(id),
      }))

      const { error: cancelError } = await db
        .from('flight_cancellations')
        .insert(cancellationsWithFlightId)

      if (cancelError) {
        console.error('Error updating cancellations:', cancelError)
      }
    }

    // Actualizar modalidad (eliminar existentes y recrear)
    if (modality) {
      // Primero eliminar modalidades existentes (cascada eliminará inventarios)
      await db.from('modalities').delete().eq('flight_id', id)

      // Construir baggageAllowance para TC
      const baggageParts = []
      if (modality.includes_backpack) baggageParts.push('Mochila')
      if (modality.carryon_weight > 0) baggageParts.push(`Carry-on ${modality.carryon_weight}kg`)
      if (modality.checked_bag_weight > 0) {
        baggageParts.push(`${modality.checked_bags_quantity}x Valija ${modality.checked_bag_weight}kg`)
      }
      const baggageAllowance = baggageParts.join(' + ') || 'Sin equipaje'

      const modalityData = {
        flight_id: parseInt(id),
        code: modality.code,
        active: modality.active,
        cabin_class_type: modality.cabin_class_type,
        baggage_allowance: baggageAllowance,
        baggage_allowance_type: 'KG',
        includes_backpack: modality.includes_backpack,
        carryon_weight: modality.carryon_weight,
        checked_bag_weight: modality.checked_bag_weight,
        checked_bags_quantity: modality.checked_bags_quantity,
        min_passengers: modality.min_passengers,
        max_passengers: modality.max_passengers,
        on_request: modality.on_request,
      }

      const { data: createdModality, error: modalityError } = await db
        .from('modalities')
        .insert(modalityData)
        .select()
        .single()

      if (modalityError) {
        console.error('Error updating modality:', modalityError)
      } else if (createdModality && modality.quantity > 0) {
        // Crear inventario con las fechas calculadas del tramo
        const inventoryData = {
          modality_id: createdModality.id,
          start_date: start_date,
          end_date: end_date,
          quantity: modality.quantity,
        }

        const { error: inventoryError } = await db
          .from('modality_inventories')
          .insert(inventoryData)

        if (inventoryError) {
          console.error('Error updating inventory:', inventoryError)
        }
      }
    }

    // ========================================
    // ACTUALIZAR VUELO PAREADO (si existe)
    // ========================================
    if (existingFlight?.paired_flight_id) {
      const pairedId = existingFlight.paired_flight_id
      const pairedLegType = currentLegType === 'outbound' ? 'return' : 'outbound'
      console.log('[FLIGHTS API] Updating paired flight:', pairedId, 'legType:', pairedLegType)

      // Obtener fecha y días operacionales del tramo pareado
      const pairedLegDate = pairedLegType === 'outbound' ? outbound_date : return_date
      const pairedLegOperationalDays = pairedLegType === 'outbound' ? outbound_operational_days : return_operational_days

      // Filtrar segmentos del tramo pareado
      const pairedLegSegments = segments.filter(s => s.leg_type === pairedLegType)

      // Calcular fechas del vuelo pareado
      const pairedStartDate = pairedLegDate
      const pairedEndDate = calculateEndDate(pairedLegDate, pairedLegSegments)

      // Datos compartidos que deben actualizarse en el vuelo pareado
      // NO incluir: name, base_id (son específicos de cada leg)
      // CADA VUELO tiene sus propias fechas calculadas
      const sharedFlightData = {
        start_date: pairedStartDate,
        end_date: pairedEndDate,
        operational_days: pairedLegOperationalDays,
        airline_code: flightData.airline_code,
        transport_type: flightData.transport_type,
        active: flightData.active,
        price_per_pax: flightData.price_per_pax,
        currency: flightData.currency,
        base_adult_price: flightData.base_adult_price,
        base_children_price: flightData.base_children_price,
        base_infant_price: flightData.base_infant_price,
        base_adult_rt_price: flightData.base_adult_rt_price,
        base_children_rt_price: flightData.base_children_rt_price,
        base_infant_rt_price: flightData.base_infant_rt_price,
        adult_taxes_amount: flightData.adult_taxes_amount,
        children_taxes_amount: flightData.children_taxes_amount,
        infant_taxes_amount: flightData.infant_taxes_amount,
        adult_rt_taxes_amount: flightData.adult_rt_taxes_amount,
        children_rt_taxes_amount: flightData.children_rt_taxes_amount,
        infant_rt_taxes_amount: flightData.infant_rt_taxes_amount,
        release_contract: flightData.release_contract,
        only_holiday_package: flightData.only_holiday_package,
        show_in_transport_quotas_landing: flightData.show_in_transport_quotas_landing,
        min_child_age: flightData.min_child_age,
        max_child_age: flightData.max_child_age,
        min_infant_age: flightData.min_infant_age,
        max_infant_age: flightData.max_infant_age,
        allow_ow_price: flightData.allow_ow_price,
        allow_rt_price: flightData.allow_rt_price,
        product_types: flightData.product_types,
        sync_status: 'modified',
        updated_at: new Date().toISOString(),
      }

      console.log('[FLIGHTS API] Paired flight dates:', { pairedStartDate, pairedEndDate })

      // Actualizar datos del vuelo pareado
      const { data: updatedPairedFlight, error: pairedFlightError } = await db
        .from('flights')
        .update(sharedFlightData)
        .eq('id', pairedId)
        .select('id, name, base_adult_price, sync_status')
        .single()

      if (pairedFlightError) {
        console.error('[FLIGHTS API] Error updating paired flight:', pairedFlightError)
      } else {
        console.log('[FLIGHTS API] Paired flight update result:', updatedPairedFlight)
      }

      // Actualizar segmentos del vuelo pareado
      await db.from('flight_segments').delete().eq('flight_id', pairedId)
      if (pairedLegSegments.length > 0) {
        const pairedSegmentsWithFlightId = pairedLegSegments.map((segment, index) => ({
          ...segment,
          flight_id: pairedId,
          sort_order: index,
        }))

        const { error: pairedSegmentsError } = await db
          .from('flight_segments')
          .insert(pairedSegmentsWithFlightId)

        if (pairedSegmentsError) {
          console.error('Error updating paired segments:', pairedSegmentsError)
        }
      }

      // Actualizar modalidad del vuelo pareado (si hay modalidad)
      if (modality) {
        // Eliminar modalidades existentes del vuelo pareado
        await db.from('modalities').delete().eq('flight_id', pairedId)

        const baggageParts = []
        if (modality.includes_backpack) baggageParts.push('Mochila')
        if (modality.carryon_weight > 0) baggageParts.push(`Carry-on ${modality.carryon_weight}kg`)
        if (modality.checked_bag_weight > 0) {
          baggageParts.push(`${modality.checked_bags_quantity}x Valija ${modality.checked_bag_weight}kg`)
        }
        const baggageAllowance = baggageParts.join(' + ') || 'Sin equipaje'

        const pairedModalityData = {
          flight_id: pairedId,
          code: modality.code,
          active: modality.active,
          cabin_class_type: modality.cabin_class_type,
          baggage_allowance: baggageAllowance,
          baggage_allowance_type: 'KG',
          includes_backpack: modality.includes_backpack,
          carryon_weight: modality.carryon_weight,
          checked_bag_weight: modality.checked_bag_weight,
          checked_bags_quantity: modality.checked_bags_quantity,
          min_passengers: modality.min_passengers,
          max_passengers: modality.max_passengers,
          on_request: modality.on_request,
        }

        const { data: pairedCreatedModality, error: pairedModalityError } = await db
          .from('modalities')
          .insert(pairedModalityData)
          .select()
          .single()

        if (pairedModalityError) {
          console.error('Error updating paired modality:', pairedModalityError)
        } else if (pairedCreatedModality && modality.quantity > 0) {
          // Crear inventario para el vuelo pareado con sus propias fechas calculadas
          const pairedInventoryData = {
            modality_id: pairedCreatedModality.id,
            start_date: pairedStartDate,
            end_date: pairedEndDate,
            quantity: modality.quantity,
          }

          const { error: pairedInventoryError } = await db
            .from('modality_inventories')
            .insert(pairedInventoryData)

          if (pairedInventoryError) {
            console.error('Error updating paired inventory:', pairedInventoryError)
          }
        }
      }

      console.log('[FLIGHTS API] Paired flight updated successfully')
    }

    // Obtener el vuelo completo con relaciones
    const { data: completeFlight } = await db
      .from('flights')
      .select(`
        *,
        flight_segments(*),
        flight_datasheets(*),
        flight_cancellations(*),
        modalities(*, modality_inventories(*))
      `)
      .eq('id', id)
      .single()

    return NextResponse.json(completeFlight)
  } catch (error) {
    console.error('Validation error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error de validación' }, { status: 400 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const supabase = await createClient()
  const db = getUntypedClient() // Need untyped client for relations

  console.log('[DELETE API] Deleting flight:', id)

  // Verificar autenticación
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // Check if TC deactivation is requested (via query param)
  const { searchParams } = new URL(request.url)
  const deleteFromTC = searchParams.get('deleteFromTC') === 'true'

  console.log('[DELETE API] deleteFromTC:', deleteFromTC)

  // Fetch full flight data to deactivate in TC
  const { data: flight, error: fetchError } = await db
    .from('flights')
    .select(`
      *,
      flight_segments(*)
    `)
    .eq('id', id)
    .single()

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 404 })
  }

  console.log('[DELETE API] Flight tc_transport_id:', flight?.tc_transport_id)

  // Deactivate in TravelCompositor if requested and flight has TC ID
  let tcDeleteResult = null
  if (deleteFromTC && flight?.tc_transport_id) {
    console.log('[DELETE API] Deactivating in TC:', flight.tc_transport_id)

    // Import mapper to convert flight to TC format
    const { mapFlightToTransport } = await import('@/lib/travelcompositor/mapper')
    const { tcClient } = await import('@/lib/travelcompositor/client')

    // Map flight to TC format and set active=false
    const tcTransport = mapFlightToTransport(flight)
    tcTransport.active = false

    console.log('[DELETE API] Deactivating transport with data:', { id: tcTransport.id, name: tcTransport.name, active: tcTransport.active })

    // Use syncTransport which handles update (PUT) when id exists
    tcDeleteResult = await tcClient.syncTransport(tcTransport)

    console.log('[DELETE API] TC deactivation result:', tcDeleteResult)

    if (!tcDeleteResult.success) {
      // Log the error but continue with local deletion
      console.error('[DELETE API] TC deactivation failed:', tcDeleteResult.error)
    }
  }

  // Delete from local database
  const { error } = await supabase
    .from('flights')
    .delete()
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    tcDeleted: tcDeleteResult?.success ?? false,
    tcError: tcDeleteResult?.error,
  })
}
