import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'
import { getLogFeed } from '@/lib/logs/feed'

/**
 * Feed unificado de actividad del sistema. La normalización de las cinco
 * fuentes vive en @/lib/logs/feed.
 */
export async function GET(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const params = request.nextUrl.searchParams

  try {
    const result = await getLogFeed(createAdminClient(), {
      origins: (params.get('origins') || 'all').split(','),
      level: params.get('level') || 'all',
      search: params.get('search') || '',
      since: params.get('since'),
      until: params.get('until'),
      limit: parseInt(params.get('limit') || '100'),
      offset: parseInt(params.get('offset') || '0'),
    })
    return NextResponse.json(result)
  } catch (error) {
    return errorResponse(error)
  }
}

/**
 * Limpieza: borra eventos anteriores a N días en todas las fuentes propias.
 * No toca notification_logs ni ai_generation_logs, que son historial de negocio.
 */
export async function DELETE(request: NextRequest) {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()
  const days = parseInt(request.nextUrl.searchParams.get('days') || '30')

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - days)
  const cutoffIso = cutoff.toISOString()

  const deleted: Record<string, number> = {}
  for (const table of ['system_logs', 'sync_logs', 'package_sync_logs'] as const) {
    const { error, count } = await db.from(table).delete({ count: 'exact' }).lt('created_at', cutoffIso)
    if (error) return errorResponse(error)
    deleted[table] = count || 0
  }

  return NextResponse.json({ deleted, total: Object.values(deleted).reduce((a, b) => a + b, 0) })
}
