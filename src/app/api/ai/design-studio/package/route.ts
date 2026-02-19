/**
 * GET /api/ai/design-studio/package?id=123
 *
 * Obtiene los datos de un paquete para el Design Studio
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'


export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const searchParams = request.nextUrl.searchParams
  const packageId = searchParams.get('id')

  if (!packageId) {
    return NextResponse.json(
      { error: 'id parameter is required' },
      { status: 400 }
    )
  }

  const db = createAdminClient()

  const { data: pkg, error } = await db
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      departure_date,
      nights_count,
      current_price_per_pax,
      currency,
      package_destinations (
        destination_name
      ),
      package_hotels (
        hotel_name,
        board_type
      ),
      package_transports (
        company
      )
    `)
    .eq('tc_package_id', packageId)
    .single()

  if (error || !pkg) {
    return NextResponse.json(
      { error: `Paquete ${packageId} no encontrado` },
      { status: 404 }
    )
  }

  // Formatear respuesta
  const response = {
    id: pkg.id,
    tc_package_id: pkg.tc_package_id,
    destination: pkg.package_destinations?.[0]?.destination_name || 'Destino desconocido',
    price: pkg.current_price_per_pax,
    currency: pkg.currency,
    nights: pkg.nights_count,
    departure_date: pkg.departure_date,
    hotel: pkg.package_hotels?.[0]?.hotel_name,
    board_type: pkg.package_hotels?.[0]?.board_type,
    airline: pkg.package_transports?.[0]?.company,
  }

  return NextResponse.json(response)
}
