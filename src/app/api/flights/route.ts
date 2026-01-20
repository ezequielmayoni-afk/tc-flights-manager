import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { flightFormSchema } from '@/lib/validations/flight'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// Cliente sin tipos para operaciones complejas
function getUntypedClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Helper para calcular end_date basándose en plus_days de los segmentos
function calculateEndDate(startDate: string, segments: Array<{ plus_days?: number }>): string {
  // Obtener el máximo plus_days de los segmentos
  const maxPlusDays = Math.max(0, ...segments.map(s => s.plus_days || 0))

  if (maxPlusDays === 0) {
    // Si no hay +1, end_date = start_date
    return startDate
  }

  // Si hay plus_days, sumar esos días a la fecha
  const [year, month, day] = startDate.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + maxPlusDays)

  const newYear = date.getFullYear()
  const newMonth = String(date.getMonth() + 1).padStart(2, '0')
  const newDay = String(date.getDate()).padStart(2, '0')

  return `${newYear}-${newMonth}-${newDay}`
}

export async function GET() {
  const supabase = await createClient()

  const { data: flights, error } = await supabase
    .from('flights')
    .select(`
      *,
      flight_segments(*),
      flight_datasheets(*),
      flight_cancellations(*)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(flights)
}

// Helper to create a single flight with its relations
async function createSingleFlight(
  db: ReturnType<typeof getUntypedClient>,
  flightData: Record<string, unknown>,
  segments: Array<Record<string, unknown>>,
  datasheets: Array<Record<string, unknown>>,
  cancellations: Array<Record<string, unknown>>,
  modality: Record<string, unknown> | null,
  legType: 'outbound' | 'return',
  legDate: string, // La fecha del tramo (outbound_date o return_date)
  operationalDays: string[] // Los días operacionales del tramo
): Promise<{ success: boolean; flight?: Record<string, unknown>; error?: string }> {
  // Calcular start_date y end_date para este tramo
  const start_date = legDate
  const end_date = calculateEndDate(legDate, segments as Array<{ plus_days?: number }>)

  // Add leg_type and modify base_id/name for the leg
  const legSuffix = legType === 'outbound' ? '-IDA' : '-VUELTA'
  const insertData = {
    ...flightData,
    base_id: `${flightData.base_id}${legSuffix}`,
    name: `${flightData.name} (${legType === 'outbound' ? 'Ida' : 'Vuelta'})`,
    leg_type: legType,
    start_date,
    end_date,
    operational_days: operationalDays,
  }

  const { data: flight, error: flightError } = await db
    .from('flights')
    .insert(insertData)
    .select()
    .single()

  if (flightError) {
    console.error('Error creating flight:', flightError)
    return { success: false, error: flightError.message }
  }

  // Create segments
  if (segments.length > 0) {
    const segmentsWithFlightId = segments.map((segment, index) => ({
      ...segment,
      flight_id: flight.id,
      sort_order: index,
    }))

    const { error: segmentsError } = await db
      .from('flight_segments')
      .insert(segmentsWithFlightId)

    if (segmentsError) {
      console.error('Error creating segments:', segmentsError)
      await db.from('flights').delete().eq('id', flight.id)
      return { success: false, error: segmentsError.message }
    }
  }

  // Create datasheets
  if (datasheets.length > 0) {
    const datasheetsWithFlightId = datasheets.map(ds => ({
      ...ds,
      flight_id: flight.id,
    }))

    await db.from('flight_datasheets').insert(datasheetsWithFlightId)
  }

  // Create cancellations
  if (cancellations.length > 0) {
    const cancellationsWithFlightId = cancellations.map(c => ({
      ...c,
      flight_id: flight.id,
    }))

    await db.from('flight_cancellations').insert(cancellationsWithFlightId)
  }

  // Create modality
  if (modality) {
    const baggageParts = []
    if (modality.includes_backpack) baggageParts.push('Mochila')
    if ((modality.carryon_weight as number) > 0) baggageParts.push(`Carry-on ${modality.carryon_weight}kg`)
    if ((modality.checked_bag_weight as number) > 0) {
      baggageParts.push(`${modality.checked_bags_quantity}x Valija ${modality.checked_bag_weight}kg`)
    }
    const baggageAllowance = baggageParts.join(' + ') || 'Sin equipaje'

    const modalityData = {
      flight_id: flight.id,
      code: `${modality.code}${legSuffix}`,
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

    if (!modalityError && createdModality && (modality.quantity as number) > 0) {
      // Usar las fechas calculadas del tramo, no las genéricas
      await db.from('modality_inventories').insert({
        modality_id: createdModality.id,
        start_date: start_date,
        end_date: end_date,
        quantity: modality.quantity,
      })
    }
  }

  return { success: true, flight }
}

export async function POST(request: NextRequest) {
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

    // Usar cliente sin tipos para inserción
    const db = getUntypedClient()

    // Separate segments by leg_type
    const outboundSegments = segments.filter(s => s.leg_type === 'outbound')
    const returnSegments = segments.filter(s => s.leg_type === 'return')

    const hasOutbound = outboundSegments.length > 0
    const hasReturn = returnSegments.length > 0

    // If we have both outbound and return segments, create TWO flights
    if (hasOutbound && hasReturn) {
      // Create outbound flight
      const outboundResult = await createSingleFlight(
        db,
        { ...flightData, created_by: user.id },
        outboundSegments,
        datasheets,
        cancellations,
        modality || null,
        'outbound',
        outbound_date,
        outbound_operational_days
      )

      if (!outboundResult.success) {
        return NextResponse.json({ error: outboundResult.error }, { status: 500 })
      }

      // Create return flight
      const returnResult = await createSingleFlight(
        db,
        { ...flightData, created_by: user.id },
        returnSegments,
        datasheets,
        cancellations,
        modality || null,
        'return',
        return_date,
        return_operational_days
      )

      if (!returnResult.success) {
        // Rollback outbound flight
        await db.from('flights').delete().eq('id', outboundResult.flight!.id)
        return NextResponse.json({ error: returnResult.error }, { status: 500 })
      }

      // Link flights via paired_flight_id
      const outboundId = outboundResult.flight!.id
      const returnId = returnResult.flight!.id

      await db
        .from('flights')
        .update({ paired_flight_id: returnId })
        .eq('id', outboundId)

      await db
        .from('flights')
        .update({ paired_flight_id: outboundId })
        .eq('id', returnId)

      // Fetch both complete flights
      const { data: completeFlights } = await db
        .from('flights')
        .select(`
          *,
          flight_segments(*),
          flight_datasheets(*),
          flight_cancellations(*),
          modalities(*, modality_inventories(*))
        `)
        .in('id', [outboundId, returnId])

      return NextResponse.json({
        message: 'Se crearon 2 vuelos enlazados (Ida y Vuelta)',
        flights: completeFlights,
        outboundId,
        returnId,
      }, { status: 201 })
    }

    // Single flight creation (only outbound OR only return segments)
    // En el nuevo flujo siempre deberían haber ambos, pero dejamos este caso por compatibilidad
    const legType = hasOutbound ? 'outbound' : 'return'
    const segmentsToUse = hasOutbound ? outboundSegments : returnSegments
    const legDate = hasOutbound ? outbound_date : return_date
    const legOperationalDays = hasOutbound ? outbound_operational_days : return_operational_days

    // Calcular fechas para este tramo
    const start_date = legDate
    const end_date = calculateEndDate(legDate, segmentsToUse)

    // Create single flight
    const insertData = {
      ...flightData,
      created_by: user.id,
      leg_type: legType,
      start_date,
      end_date,
      operational_days: legOperationalDays,
    }

    const { data: flight, error: flightError } = await db
      .from('flights')
      .insert(insertData)
      .select()
      .single()

    if (flightError) {
      console.error('Error creating flight:', flightError)
      return NextResponse.json({ error: flightError.message }, { status: 500 })
    }

    // Create segments
    if (segmentsToUse.length > 0) {
      const segmentsWithFlightId = segmentsToUse.map((segment, index) => ({
        ...segment,
        flight_id: flight.id,
        sort_order: index,
      }))

      const { error: segmentsError } = await db
        .from('flight_segments')
        .insert(segmentsWithFlightId)

      if (segmentsError) {
        console.error('Error creating segments:', segmentsError)
        await db.from('flights').delete().eq('id', flight.id)
        return NextResponse.json({ error: segmentsError.message }, { status: 500 })
      }
    }

    // Create datasheets
    if (datasheets.length > 0) {
      const datasheetsWithFlightId = datasheets.map(ds => ({
        ...ds,
        flight_id: flight.id,
      }))

      await db.from('flight_datasheets').insert(datasheetsWithFlightId)
    }

    // Create cancellations
    if (cancellations.length > 0) {
      const cancellationsWithFlightId = cancellations.map(c => ({
        ...c,
        flight_id: flight.id,
      }))

      await db.from('flight_cancellations').insert(cancellationsWithFlightId)
    }

    // Create modality
    if (modality) {
      const baggageParts = []
      if (modality.includes_backpack) baggageParts.push('Mochila')
      if (modality.carryon_weight > 0) baggageParts.push(`Carry-on ${modality.carryon_weight}kg`)
      if (modality.checked_bag_weight > 0) {
        baggageParts.push(`${modality.checked_bags_quantity}x Valija ${modality.checked_bag_weight}kg`)
      }
      const baggageAllowance = baggageParts.join(' + ') || 'Sin equipaje'

      const modalityData = {
        flight_id: flight.id,
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

      if (!modalityError && createdModality && modality.quantity > 0) {
        await db.from('modality_inventories').insert({
          modality_id: createdModality.id,
          start_date: start_date,
          end_date: end_date,
          quantity: modality.quantity,
        })
      }
    }

    // Fetch complete flight
    const { data: completeFlight } = await db
      .from('flights')
      .select(`
        *,
        flight_segments(*),
        flight_datasheets(*),
        flight_cancellations(*),
        modalities(*, modality_inventories(*))
      `)
      .eq('id', flight.id)
      .single()

    return NextResponse.json(completeFlight, { status: 201 })
  } catch (error) {
    console.error('Validation error:', error)
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Error de validación' }, { status: 400 })
  }
}
