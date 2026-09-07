import { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

export interface UnifiedLog {
  id: string
  created_at: string
  source: string
  action: string
  level: 'error' | 'warning' | 'info' | 'debug'
  message: string
  entity_type: string | null
  entity_id: number | null
  entity_label: string | null
  actor: string | null
  duration_ms: number | null
  origin: 'system' | 'sync' | 'package_sync' | 'notification' | 'ai'
  detail: Record<string, unknown> | null
}

const ORIGIN_LABELS: Record<UnifiedLog['origin'], string> = {
  system: 'Sistema',
  sync: 'Sync TC',
  package_sync: 'Cron / Import',
  notification: 'Notificaciones',
  ai: 'IA',
}

function truncate(value: string, max = 200): string {
  return value.length > max ? `${value.slice(0, max)}…` : value
}


export interface LogFeedFilters {
  origins?: string[]
  level?: string
  search?: string
  since?: string | null
  until?: string | null
  limit?: number
  offset?: number
}

export interface LogFeedResult {
  logs: UnifiedLog[]
  total: number
  /** true si alguna fuente llegó al techo de la ventana y hay eventos sin mostrar */
  truncated: boolean
  hasMore: boolean
  originLabels: Record<string, string>
  stats: {
    last24h: number
    errors24h: number
    warnings24h: number
    bySource: Record<string, number>
  }
}

/** Techo de filas por fuente. Con el volumen actual (~1500 filas en total) entra todo. */
const WINDOW = 2000

export async function getLogFeed(db: Db, filters: LogFeedFilters = {}): Promise<LogFeedResult> {
  const origins = filters.origins?.length ? filters.origins : ['all']
  const wants = (o: UnifiedLog['origin']) => origins.includes('all') || origins.includes(o)
  const level = filters.level || 'all'
  const search = (filters.search || '').trim()
  const since = filters.since
  const until = filters.until
  const limit = Math.min(filters.limit ?? 100, 500)
  const offset = filters.offset ?? 0

  // El orden final es la mezcla de las cinco fuentes, así que no se puede
  // paginar en la base: se trae una ventana por fuente (acotada por el filtro
  // de fechas) y se ordena y pagina en memoria. WINDOW es el techo por fuente.
  const perSource = WINDOW

  const events: UnifiedLog[] = []
  const sourceCounts: number[] = []

    const applyDates = <T extends { gte: (c: string, v: string) => T; lte: (c: string, v: string) => T }>(q: T, column = 'created_at') => {
      let out = q
      if (since) out = out.gte(column, since)
      if (until) out = out.lte(column, until)
      return out
    }

    if (wants('system')) {
      let q = db.from('system_logs').select('*').order('created_at', { ascending: false }).limit(perSource)
      q = applyDates(q)
      const { data } = await q
      sourceCounts.push((data || []).length)
      for (const r of (data || []) as Record<string, any>[]) {
        events.push({
          id: `system-${r.id}`,
          created_at: r.created_at,
          source: r.source,
          action: r.action || '',
          level: r.level,
          message: r.message,
          entity_type: r.entity_type,
          entity_id: r.entity_id ?? r.flight_id ?? null,
          entity_label: r.entity_label,
          actor: r.actor_email,
          duration_ms: r.duration_ms,
          origin: 'system',
          detail: r.details,
        })
      }
    }

    if (wants('sync')) {
      let q = db.from('sync_logs').select('*').order('created_at', { ascending: false }).limit(perSource)
      q = applyDates(q)
      const { data } = await q
      sourceCounts.push((data || []).length)
      for (const r of (data || []) as Record<string, any>[]) {
        const what = r.entity_type === 'flight' ? 'Cupo' : r.entity_type === 'reservation' ? 'Reserva' : r.entity_type
        const verb = r.action === 'create' ? 'creado' : r.action === 'delete' ? 'borrado' : 'actualizado'
        const dir = r.direction === 'pull' ? 'desde TC' : 'en TC'
        events.push({
          id: `sync-${r.id}`,
          created_at: r.created_at,
          source: 'tc-sync',
          action: `${r.entity_type}.${r.action}`,
          level: r.status === 'error' ? 'error' : 'info',
          message: r.status === 'error'
            ? `${what} #${r.entity_id}: falló el sync con TC — ${truncate(r.error_message || 'sin detalle')}`
            : `${what} #${r.entity_id} ${verb} ${dir}`,
          entity_type: r.entity_type,
          entity_id: r.entity_id,
          entity_label: (r.response_payload?.base_id as string) || (r.response_payload?.name as string) || null,
          actor: null,
          duration_ms: null,
          origin: 'sync',
          detail: { request: r.request_payload, response: r.response_payload, error: r.error_message },
        })
      }
    }

    if (wants('package_sync')) {
      let q = db.from('package_sync_logs').select('*').order('created_at', { ascending: false }).limit(perSource)
      q = applyDates(q)
      const { data } = await q
      sourceCounts.push((data || []).length)
      for (const r of (data || []) as Record<string, any>[]) {
        const d = r.details || {}
        let message: string
        if (r.sync_type === 'cron_batch') {
          message = `Cron: ${d.successCount ?? 0}/${d.processed ?? 0} paquetes refrescados` +
            (d.priceChanges ? `, ${d.priceChanges} con cambio de precio` : '') +
            (d.failed ? `, ${d.failed} con error` : '')
        } else if (r.sync_type === 'cron_import_new') {
          message = `Cron: ${d.imported ?? 0} de ${d.detected ?? 0} paquetes nuevos importados`
        } else if (r.price_changed) {
          message = `Precio actualizado: ${r.old_price} → ${r.new_price}`
        } else {
          message = `${r.sync_type || 'sync'}: ${r.status || ''}`.trim()
        }
        events.push({
          id: `pkgsync-${r.id}`,
          created_at: r.created_at,
          source: r.sync_type?.startsWith('cron') ? 'cron' : 'paquetes',
          action: r.sync_type || 'package.sync',
          level: r.status === 'error' ? 'error' : r.status === 'partial' ? 'warning' : 'info',
          message,
          entity_type: r.package_id ? 'package' : null,
          entity_id: r.package_id,
          entity_label: null,
          actor: null,
          duration_ms: d.duration ? Math.round(parseFloat(String(d.duration)) * 1000) : null,
          origin: 'package_sync',
          detail: { ...d, error: r.error_message },
        })
      }
    }

    if (wants('notification')) {
      let q = db.from('notification_logs').select('*').order('created_at', { ascending: false }).limit(perSource)
      q = applyDates(q)
      const { data } = await q
      sourceCounts.push((data || []).length)
      for (const r of (data || []) as Record<string, any>[]) {
        events.push({
          id: `notif-${r.id}`,
          created_at: r.created_at,
          source: 'notificaciones',
          action: r.notification_type,
          level: r.status === 'failed' ? 'error' : 'info',
          message: r.status === 'failed'
            ? `${r.channel}: falló el aviso a ${r.recipient} — ${truncate(r.error_message || 'sin detalle')}`
            : `${r.channel} → ${r.recipient}: ${r.message_title || r.notification_type}`,
          entity_type: r.package_id ? 'package' : null,
          entity_id: r.package_id,
          entity_label: null,
          actor: null,
          duration_ms: null,
          origin: 'notification',
          detail: { data: r.message_data, body: r.message_body, error: r.error_message },
        })
      }
    }

    if (wants('ai')) {
      let q = db.from('ai_generation_logs').select('*').order('created_at', { ascending: false }).limit(perSource)
      q = applyDates(q)
      const { data } = await q
      sourceCounts.push((data || []).length)
      for (const r of (data || []) as Record<string, any>[]) {
        events.push({
          id: `ai-${r.id}`,
          created_at: r.created_at,
          source: 'diseño',
          action: 'ai.generate_creative',
          level: r.status === 'error' ? 'error' : 'info',
          message: r.status === 'error'
            ? `IA: falló la variante ${r.variant} ${r.aspect_ratio} del paquete ${r.tc_package_id} — ${truncate(r.error_message || 'sin detalle')}`
            : `IA: creativo generado (variante ${r.variant}, ${r.aspect_ratio}) para el paquete ${r.tc_package_id}`,
          entity_type: 'package',
          entity_id: r.package_id,
          entity_label: r.tc_package_id ? String(r.tc_package_id) : null,
          actor: null,
          duration_ms: r.duration_ms,
          origin: 'ai',
          detail: { model: r.model_used, assets: r.assets_used, error: r.error_details || r.error_message },
        })
      }
    }

    let filtered = events
    if (level !== 'all') filtered = filtered.filter(e => e.level === level)
    if (search) {
      const needle = search.toLowerCase()
      filtered = filtered.filter(e =>
        e.message.toLowerCase().includes(needle) ||
        e.action.toLowerCase().includes(needle) ||
        (e.entity_label || '').toLowerCase().includes(needle) ||
        (e.actor || '').toLowerCase().includes(needle) ||
        String(e.entity_id || '').includes(needle)
      )
    }

    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at))

  const total = filtered.length
  const page = filtered.slice(offset, offset + limit)
  const truncated = sourceCounts.some(n => n >= WINDOW)

    // Resumen de las últimas 24 h, sin filtros: es el semáforo de la pantalla
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const last24h = events.filter(e => e.created_at >= dayAgo)

  return {
      logs: page,
    total,
    truncated,
    hasMore: offset + limit < total,
      originLabels: ORIGIN_LABELS,
      stats: {
        last24h: last24h.length,
        errors24h: last24h.filter(e => e.level === 'error').length,
        warnings24h: last24h.filter(e => e.level === 'warning').length,
        bySource: last24h.reduce((acc, e) => {
          acc[e.source] = (acc[e.source] || 0) + 1
          return acc
        }, {} as Record<string, number>),
    },
  }

}
