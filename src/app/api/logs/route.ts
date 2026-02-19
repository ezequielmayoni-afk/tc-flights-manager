import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

// Cliente sin tipos para evitar errores de tipado con sync_logs

export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createAdminClient()
  const searchParams = request.nextUrl.searchParams

  // Filters
  const status = searchParams.get('status')
  const entityType = searchParams.get('entity_type')
  const search = searchParams.get('search')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = parseInt(searchParams.get('offset') || '0')

  let query = supabase
    .from('sync_logs')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  if (entityType && entityType !== 'all') {
    query = query.eq('entity_type', entityType)
  }

  if (search) {
    query = query.or(`error_message.ilike.%${search}%,action.ilike.%${search}%`)
  }

  const { data: logs, error, count } = await query

  if (error) {
    return errorResponse(error)
  }

  return NextResponse.json({ logs, total: count })
}

export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createAdminClient()
  const body = await request.json()

  // Mapear campos a las columnas reales de sync_logs
  const { data, error } = await supabase
    .from('sync_logs')
    .insert({
      entity_type: body.entity_type || 'flight',
      entity_id: body.entity_id || body.flight_id || 0,
      action: body.action || 'update',
      direction: body.direction || 'push',
      status: body.status || 'error',
      request_payload: body.request_payload || body.request_data,
      response_payload: body.response_payload || body.response_data,
      error_message: body.error_message || body.message,
    })
    .select()
    .single()

  if (error) {
    console.error('Error saving log:', error)
    return errorResponse(error)
  }

  return NextResponse.json(data)
}

// Delete old logs (cleanup)
export async function DELETE(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const supabase = createAdminClient()
  const searchParams = request.nextUrl.searchParams
  const days = parseInt(searchParams.get('days') || '30')

  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - days)

  const { error, count } = await supabase
    .from('sync_logs')
    .delete()
    .lt('created_at', cutoffDate.toISOString())

  if (error) {
    return errorResponse(error)
  }

  return NextResponse.json({ deleted: count })
}
