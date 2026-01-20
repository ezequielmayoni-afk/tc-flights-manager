import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/packages/debug-db?id=43317855
 * Debug endpoint to see what's stored in DB for a package's transports
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const tcPackageId = searchParams.get('id')

  if (!tcPackageId) {
    return NextResponse.json({ error: 'Package ID required' }, { status: 400 })
  }

  const db = getSupabaseClient()

  try {
    // First get the package
    const { data: pkg, error: pkgError } = await db
      .from('packages')
      .select('id, tc_package_id, title')
      .eq('tc_package_id', parseInt(tcPackageId))
      .single()

    if (pkgError || !pkg) {
      return NextResponse.json({ error: 'Package not found in DB', tcPackageId }, { status: 404 })
    }

    // Get all transports for this package
    const { data: transports, error: transportError } = await db
      .from('package_transports')
      .select('*')
      .eq('package_id', pkg.id)
      .order('sort_order')

    if (transportError) {
      return NextResponse.json({ error: transportError.message }, { status: 500 })
    }

    // Analyze empty fields
    const emptyFieldsAnalysis = transports?.map((t, index) => {
      const emptyFields: string[] = []
      const filledFields: string[] = []

      const fieldsToCheck = [
        'tc_transport_id',
        'tc_provider_code',
        'supplier_name',
        'day',
        'transport_type',
        'direction',
        'origin_code',
        'origin_name',
        'destination_code',
        'destination_name',
        'company',
        'transport_number',
        'marketing_airline_code',
        'operating_airline_code',
        'operating_airline_name',
        'departure_date',
        'departure_time',
        'arrival_date',
        'arrival_time',
        'duration',
        'day_difference',
        'fare',
        'fare_class',
        'fare_basis',
        'cabin_class',
        'baggage_info',
        'checked_baggage',
        'cabin_baggage',
        'aircraft_type',
        'terminal_departure',
        'terminal_arrival',
        'num_segments',
        'net_price',
        'total_price',
        'currency',
        'mandatory',
        'is_refundable',
        'adults_count',
        'children_count',
        'infants_count',
      ]

      for (const field of fieldsToCheck) {
        const value = t[field]
        if (value === null || value === undefined || value === '') {
          emptyFields.push(field)
        } else {
          filledFields.push(`${field}: ${value}`)
        }
      }

      return {
        transportIndex: index,
        tc_transport_id: t.tc_transport_id,
        direction: t.direction,
        emptyFieldsCount: emptyFields.length,
        emptyFields,
        filledFieldsCount: filledFields.length,
        filledFields,
      }
    })

    return NextResponse.json({
      package: pkg,
      transportsCount: transports?.length || 0,
      transports: transports,
      emptyFieldsAnalysis,
    })
  } catch (error) {
    console.error('[Debug DB] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error' },
      { status: 500 }
    )
  }
}
