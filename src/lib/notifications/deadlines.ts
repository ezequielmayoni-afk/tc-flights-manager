/**
 * Avisos de tareas vencidas.
 *
 * Sigue el mismo molde que manual-quote.ts: busca lo vencido, deduplica contra
 * notification_logs con una ventana de 24 h para no repetir el mismo aviso
 * varias veces por día, manda UN mensaje consolidado y registra el resultado.
 */

import { createClient } from '@supabase/supabase-js'
import { sendSlackMessage, buildDeadlineSummaryMessage } from '@/lib/slack/client'
import { mentions, type SlackUserKey } from '@/lib/slack/mentions'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const SYSTEM_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://hub.siviajo.com'
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000

export interface DeadlineNotificationResult {
  success: boolean
  message: string
  sent: number
  total: number
  error?: string
}

interface OverdueItem {
  packageId: number
  tcPackageId: number
  packageTitle: string
  deadline: string
  hoursOverdue: number
}

function hoursSince(deadline: string): number {
  return (Date.now() - new Date(deadline).getTime()) / (60 * 60 * 1000)
}

/**
 * Tronco común: dedup + settings + envío + logs. Lo único que cambia entre
 * cotización manual y diseño es qué se considera vencido y a quién se avisa.
 */
async function notifyOverdue(
  kind: 'requote' | 'design',
  items: OverdueItem[],
  config: {
    settingFlag: 'notify_requote_deadline' | 'notify_design_deadline'
    summaryType: string
    itemType: string
    mentionKeys: SlackUserKey[]
    channelField: 'slack_channel_marketing' | 'slack_channel_design'
  }
): Promise<DeadlineNotificationResult> {
  const db = getSupabaseClient()

  if (items.length === 0) {
    return { success: true, message: 'No hay tareas vencidas', sent: 0, total: 0 }
  }

  const since = new Date(Date.now() - DEDUP_WINDOW_MS).toISOString()

  const { data: recentItemLogs } = await db
    .from('notification_logs')
    .select('package_id')
    .eq('notification_type', config.itemType)
    .gte('created_at', since)

  const alreadyNotified = new Set((recentItemLogs || []).map(l => l.package_id))
  const toNotify = items.filter(item => !alreadyNotified.has(item.packageId))

  if (toNotify.length === 0) {
    return {
      success: true,
      message: 'Ya se avisó por todas en las últimas 24 h',
      sent: 0,
      total: items.length,
    }
  }

  const { data: settings } = await db
    .from('notification_settings')
    .select('*')
    .eq('id', 1)
    .single()

  if (!settings?.slack_enabled || !settings?.slack_webhook_url) {
    return {
      success: false,
      message: 'Slack no está habilitado',
      sent: 0,
      total: toNotify.length,
    }
  }

  if (settings[config.settingFlag] === false) {
    return {
      success: false,
      message: `Avisos de ${kind} desactivados en la configuración`,
      sent: 0,
      total: toNotify.length,
    }
  }

  const message = buildDeadlineSummaryMessage({
    kind,
    items: toNotify,
    systemUrl: SYSTEM_URL,
    mentionUsers: mentions(config.mentionKeys),
  })

  const channel = settings[config.channelField] || '#general'
  const slackResult = await sendSlackMessage(settings.slack_webhook_url, message)

  await db.from('notification_logs').insert({
    notification_type: config.summaryType,
    channel: 'slack',
    recipient: channel,
    package_id: null,
    message_title: `${toNotify.length} tarea(s) de ${kind === 'requote' ? 'cotización manual' : 'diseño'} vencida(s)`,
    message_data: {
      count: toNotify.length,
      packages: toNotify.map(i => i.tcPackageId),
      mentioned: config.mentionKeys,
    },
    status: slackResult.ok ? 'sent' : 'failed',
    error_message: slackResult.error,
    sent_at: slackResult.ok ? new Date().toISOString() : null,
  })

  // Una fila por paquete: es lo que después deduplica los avisos del día siguiente.
  if (slackResult.ok) {
    await db.from('notification_logs').insert(
      toNotify.map(item => ({
        notification_type: config.itemType,
        channel: 'slack',
        recipient: channel,
        package_id: item.packageId,
        message_title: `Vencido: ${item.tcPackageId} - ${item.packageTitle}`,
        message_data: { deadline: item.deadline, hoursOverdue: Math.round(item.hoursOverdue) },
        status: 'sent',
        sent_at: new Date().toISOString(),
      }))
    )
  }

  return {
    success: slackResult.ok,
    message: slackResult.ok
      ? `Aviso enviado por ${toNotify.length} tarea(s)`
      : `Falló el envío: ${slackResult.error}`,
    sent: slackResult.ok ? toNotify.length : 0,
    total: toNotify.length,
    error: slackResult.error,
  }
}

/**
 * Cotizaciones manuales que pasaron las 48 h sin resolverse.
 * El reloj (needs_manual_since) lo prende un trigger al entrar al estado.
 */
export async function checkAndSendRequoteDeadlineNotifications(): Promise<DeadlineNotificationResult> {
  const db = getSupabaseClient()

  const { data, error } = await db
    .from('packages')
    .select('id, tc_package_id, title, needs_manual_since')
    .eq('requote_status', 'needs_manual')
    .eq('monitor_enabled', true)
    .not('needs_manual_since', 'is', null)
    .lte('needs_manual_since', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())

  if (error) {
    return { success: false, message: error.message, sent: 0, total: 0, error: error.message }
  }

  const items: OverdueItem[] = (data || []).map(pkg => {
    const deadline = new Date(new Date(pkg.needs_manual_since).getTime() + 48 * 60 * 60 * 1000).toISOString()
    return {
      packageId: pkg.id,
      tcPackageId: pkg.tc_package_id,
      packageTitle: pkg.title,
      deadline,
      hoursOverdue: hoursSince(deadline),
    }
  })

  return notifyOverdue('requote', items, {
    settingFlag: 'notify_requote_deadline',
    summaryType: 'requote_deadline_summary',
    itemType: 'requote_deadline',
    mentionKeys: ['marcelo', 'eze'],
    channelField: 'slack_channel_marketing',
  })
}

/**
 * Pedidos de diseño vencidos.
 *
 * Se miran las dos puntas porque un pedido puede llegar por cualquiera de las
 * dos y no siempre coinciden: el paquete marcado para diseño (design_deadline)
 * y la solicitud de creativos que entra desde marketing (creative_requests),
 * que no toca send_to_design.
 */
export async function checkAndSendDesignDeadlineNotifications(): Promise<DeadlineNotificationResult> {
  const db = getSupabaseClient()
  const now = new Date().toISOString()

  const { data: packages, error: pkgError } = await db
    .from('packages')
    .select('id, tc_package_id, title, design_deadline')
    .eq('send_to_design', true)
    .eq('design_completed', false)
    .not('design_deadline', 'is', null)
    .lte('design_deadline', now)

  if (pkgError) {
    return { success: false, message: pkgError.message, sent: 0, total: 0, error: pkgError.message }
  }

  const { data: requests, error: reqError } = await db
    .from('creative_requests')
    .select('package_id, tc_package_id, deadline_at, packages(title)')
    .in('status', ['pending', 'in_progress'])
    .not('deadline_at', 'is', null)
    .lte('deadline_at', now)

  if (reqError) {
    return { success: false, message: reqError.message, sent: 0, total: 0, error: reqError.message }
  }

  const byPackage = new Map<number, OverdueItem>()

  for (const pkg of packages || []) {
    byPackage.set(pkg.id, {
      packageId: pkg.id,
      tcPackageId: pkg.tc_package_id,
      packageTitle: pkg.title,
      deadline: pkg.design_deadline,
      hoursOverdue: hoursSince(pkg.design_deadline),
    })
  }

  for (const req of (requests || []) as Array<Record<string, unknown>>) {
    const packageId = req.package_id as number
    if (!packageId || byPackage.has(packageId)) continue
    const deadline = req.deadline_at as string
    const related = req.packages as { title?: string } | null
    byPackage.set(packageId, {
      packageId,
      tcPackageId: req.tc_package_id as number,
      packageTitle: related?.title || `Paquete ${req.tc_package_id}`,
      deadline,
      hoursOverdue: hoursSince(deadline),
    })
  }

  const items = [...byPackage.values()].sort((a, b) => b.hoursOverdue - a.hoursOverdue)

  return notifyOverdue('design', items, {
    settingFlag: 'notify_design_deadline',
    summaryType: 'design_deadline_summary',
    itemType: 'design_deadline',
    mentionKeys: ['maru', 'angela', 'eze'],
    channelField: 'slack_channel_design',
  })
}
