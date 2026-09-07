/**
 * Slack Integration Client
 * Handles sending notifications to Slack channels via webhooks
 */

export interface SlackMessage {
  text?: string
  blocks?: SlackBlock[]
  attachments?: SlackAttachment[]
  thread_ts?: string // For threading replies
}

export interface SlackBlock {
  type: 'section' | 'header' | 'divider' | 'context' | 'actions'
  text?: {
    type: 'plain_text' | 'mrkdwn'
    text: string
    emoji?: boolean
  }
  fields?: Array<{
    type: 'mrkdwn' | 'plain_text'
    text: string
  }>
  accessory?: {
    type: 'button'
    text: { type: 'plain_text'; text: string }
    url?: string
    action_id?: string
  }
  elements?: Array<{
    type: 'mrkdwn' | 'plain_text' | 'button'
    text: string | { type: 'plain_text'; text: string }
    url?: string
  }>
}

export interface SlackAttachment {
  color?: string
  blocks?: SlackBlock[]
}

export interface SlackResponse {
  ok: boolean
  ts?: string // Message timestamp (ID)
  error?: string
}

export interface NotificationPayload {
  type: 'price_change' | 'creative_request' | 'creative_completed' | 'ad_underperforming' | 'needs_manual_quote' | 'new_package_imported'
  channel: 'design' | 'marketing'
  packageId: number
  tcPackageId: number
  packageTitle: string
  data: Record<string, unknown>
}

/**
 * Send a message to Slack via webhook
 */
export async function sendSlackMessage(
  webhookUrl: string,
  message: SlackMessage
): Promise<SlackResponse> {
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, error: text }
    }

    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Build Slack message for price change notification
 */
export function buildPriceChangeMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  oldPrice: number
  newPrice: number
  currency: string
  variancePct: number
  systemUrl: string
}): SlackMessage {
  const priceDirection = data.newPrice > data.oldPrice ? 'subió' : 'bajó'
  const emoji = data.newPrice > data.oldPrice ? '📈' : '📉'
  const color = data.newPrice > data.oldPrice ? '#e74c3c' : '#27ae60'

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Cambio de Precio Detectado`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Variación:*\n${data.variancePct > 0 ? '+' : ''}${data.variancePct.toFixed(1)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Precio Anterior:*\n${data.currency} ${data.oldPrice.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Precio Nuevo:*\n${data.currency} ${data.newPrice.toLocaleString()}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `El precio ${priceDirection}. Los creativos pueden necesitar actualización.`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver en Sistema' },
            url: `${data.systemUrl}/packages/${data.packageId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver en Diseño' },
            url: `${data.systemUrl}/packages/design?search=${data.tcPackageId}`,
          },
        ],
      },
    ],
    attachments: [{ color }],
  }
}

/**
 * Build Slack message for creative request
 */
export function buildCreativeRequestMessage(data: {
  requestId: number
  packageId: number
  tcPackageId: number
  packageTitle: string
  requestedBy: string
  reason: string
  reasonDetail?: string
  priority: 'urgent' | 'normal' | 'low'
  variant?: number
  aspectRatio?: string
  requestedVariants?: number[]
  systemUrl: string
}): SlackMessage {
  const priorityEmoji = {
    urgent: '🔴',
    normal: '🟡',
    low: '🟢',
  }

  const reasonLabels: Record<string, string> = {
    new_package: 'Paquete nuevo',
    price_change: 'Cambio de precio',
    low_performance: 'Bajo rendimiento del anuncio',
    new_variant: 'Nueva variante necesaria',
    update_content: 'Actualización de contenido',
    other: 'Otro',
  }

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `${priorityEmoji[data.priority]} Nueva Solicitud de Creativo`,
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
        },
        {
          type: 'mrkdwn',
          text: `*Prioridad:*\n${data.priority.toUpperCase()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Motivo:*\n${reasonLabels[data.reason] || data.reason}`,
        },
        {
          type: 'mrkdwn',
          text: `*Solicitado por:*\n${data.requestedBy}`,
        },
      ],
    },
  ]

  // Add requested variants if provided
  if (data.requestedVariants && data.requestedVariants.length > 0) {
    const variantLabels: Record<number, string> = {
      1: 'V1 (Precio/Oferta)',
      2: 'V2 (Experiencia)',
      3: 'V3 (Destino)',
      4: 'V4 (Conveniencia)',
      5: 'V5 (Escasez)',
    }
    const variantsList = data.requestedVariants
      .sort((a, b) => a - b)
      .map(v => variantLabels[v] || `V${v}`)
      .join('\n• ')

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Variantes solicitadas (${data.requestedVariants.length}):*\n• ${variantsList}`,
      },
    })
  }

  // Add detail if provided
  if (data.reasonDetail) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Detalle:*\n${data.reasonDetail}`,
      },
    })
  }

  // Add variant/format info if specific (legacy support)
  if (data.variant || data.aspectRatio) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `${data.variant ? `Variante: ${data.variant}` : 'Todas las variantes'} | ${data.aspectRatio ? `Formato: ${data.aspectRatio}` : 'Todos los formatos'}`,
        },
      ],
    })
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ver Solicitud' },
          url: `${data.systemUrl}/packages/design?request=${data.requestId}`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ir a Diseño' },
          url: `${data.systemUrl}/packages/design?search=${data.tcPackageId}`,
        },
      ],
    }
  )

  return { blocks }
}

/**
 * Build Slack message for creative completed
 */
export function buildCreativeCompletedMessage(data: {
  requestId: number
  packageId: number
  tcPackageId: number
  packageTitle: string
  completedBy: string
  notes?: string
  systemUrl: string
}): SlackMessage {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '✅ Creativo Completado',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Completado por:*\n${data.completedBy}`,
          },
        ],
      },
      ...(data.notes
        ? [
            {
              type: 'section' as const,
              text: {
                type: 'mrkdwn' as const,
                text: `*Notas:*\n${data.notes}`,
              },
            },
          ]
        : []),
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver en Marketing' },
            url: `${data.systemUrl}/packages/marketing?search=${data.tcPackageId}`,
          },
        ],
      },
    ],
  }
}

/**
 * Build Slack message for underperforming ad
 */
export function buildAdUnderperformingMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  adId: string
  adName: string
  metrics: {
    ctr?: number
    cpl?: number
    spend?: number
    leads?: number
  }
  thresholds: {
    ctr?: number
    cpl?: number
  }
  systemUrl: string
}): SlackMessage {
  const issues: string[] = []

  if (data.thresholds.ctr && data.metrics.ctr !== undefined && data.metrics.ctr < data.thresholds.ctr) {
    issues.push(`CTR bajo: ${data.metrics.ctr.toFixed(2)}% (umbral: ${data.thresholds.ctr}%)`)
  }

  if (data.thresholds.cpl && data.metrics.cpl !== undefined && data.metrics.cpl > data.thresholds.cpl) {
    issues.push(`CPL alto: $${data.metrics.cpl.toFixed(2)} (umbral: $${data.thresholds.cpl})`)
  }

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '⚠️ Anuncio con Bajo Rendimiento',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Anuncio:*\n${data.adName}`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Problemas detectados:*\n${issues.map((i) => `• ${i}`).join('\n')}`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Gasto:*\n$${data.metrics.spend?.toFixed(2) || '0'}`,
          },
          {
            type: 'mrkdwn',
            text: `*Leads:*\n${data.metrics.leads || 0}`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver Analytics' },
            url: `${data.systemUrl}/packages/marketing/analytics?package=${data.packageId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Solicitar Nuevo Creativo' },
            url: `${data.systemUrl}/packages/marketing?action=request-creative&package=${data.packageId}`,
          },
        ],
      },
    ],
    attachments: [{ color: '#f39c12' }],
  }
}

/**
 * Build Slack message for needs manual quote notification
 */
export function buildNeedsManualQuoteMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  oldPrice: number
  newPrice: number
  currency: string
  variancePct: number
  systemUrl: string
}): SlackMessage {
  const priceDirection = data.newPrice > data.oldPrice ? 'subió' : 'bajó'
  const emoji = '🔔'
  const color = '#e74c3c' // Red for urgent attention

  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${emoji} Paquete Requiere Cotización Manual`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Variación:*\n${data.variancePct > 0 ? '+' : ''}${data.variancePct.toFixed(1)}%`,
          },
          {
            type: 'mrkdwn',
            text: `*Precio Anterior:*\n${data.currency} ${data.oldPrice.toLocaleString()}`,
          },
          {
            type: 'mrkdwn',
            text: `*Precio Nuevo:*\n${data.currency} ${data.newPrice.toLocaleString()}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `⚠️ El precio ${priceDirection} más de 10%. Se requiere revisión y cotización manual.`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver Paquete' },
            url: `${data.systemUrl}/packages/${data.packageId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ir a Recotización Manual' },
            url: `${data.systemUrl}/tareas`,
          },
        ],
      },
    ],
    attachments: [{ color }],
  }
}

/**
 * Build Slack message for new package imported (requires SEO)
 */
export function buildNewPackageImportedMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  price: number
  currency: string
  destinationsCount: number
  nightsCount: number
  importedBy: string
  systemUrl: string
}): SlackMessage {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📦 Nuevo Paquete Importado - Requiere Carga SEO',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Precio:*\n${data.currency} ${data.price.toLocaleString()} por persona`,
          },
          {
            type: 'mrkdwn',
            text: `*Destinos:*\n${data.destinationsCount} destino(s)`,
          },
          {
            type: 'mrkdwn',
            text: `*Noches:*\n${data.nightsCount} noche(s)`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `✏️ Se requiere revisión y carga de contenido SEO. Importado por: ${data.importedBy}`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver Paquete' },
            url: `${data.systemUrl}/packages/${data.packageId}`,
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Editar SEO' },
            url: `${data.systemUrl}/packages/${data.packageId}?tab=seo`,
          },
        ],
      },
    ],
    attachments: [{ color: '#3498db' }], // Blue for info
  }
}

/**
 * Build Slack message for manual quote summary (consolidated notification)
 */
export function buildManualQuoteSummaryMessage(data: {
  packages: Array<{
    packageId: number
    tcPackageId: number
    packageTitle: string
    oldPrice: number
    newPrice: number
    currency: string
    variancePct: number
  }>
  systemUrl: string
  mentionUser?: string // e.g., "@marcelo" or Slack user ID like "<@U12345>"
}): SlackMessage {
  const packageCount = data.packages.length

  // Build the list of packages
  const packagesList = data.packages
    .map(pkg => {
      const direction = pkg.newPrice > pkg.oldPrice ? '↑' : '↓'
      return `• <${data.systemUrl}/packages/${pkg.packageId}|${pkg.tcPackageId}> - ${pkg.packageTitle}\n   ${pkg.currency} ${pkg.oldPrice.toLocaleString()} → ${pkg.currency} ${pkg.newPrice.toLocaleString()} (${pkg.variancePct > 0 ? '+' : ''}${pkg.variancePct.toFixed(1)}% ${direction})`
    })
    .join('\n')

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `🔔 ${packageCount} Paquete${packageCount > 1 ? 's' : ''} Requiere${packageCount > 1 ? 'n' : ''} Cotización Manual`,
        emoji: true,
      },
    },
  ]

  // Add mention if provided
  if (data.mentionUser) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${data.mentionUser} - Se detectaron variaciones de precio significativas en los siguientes paquetes:`,
      },
    })
  } else {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: 'Se detectaron variaciones de precio significativas en los siguientes paquetes:',
      },
    })
  }

  // Add packages list
  blocks.push({
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: packagesList,
    },
  })

  blocks.push(
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `⚠️ Estos paquetes tienen variaciones mayores al umbral configurado y requieren revisión manual.`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ir a Recotización' },
          url: `${data.systemUrl}/tareas`,
        },
      ],
    }
  )

  return {
    blocks,
    attachments: [{ color: '#e74c3c' }], // Red for urgent
  }
}

/**
 * Build Slack message for package sent to marketing
 */
export function buildSentToMarketingMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  sentBy: string
  creativesCount: number
  systemUrl: string
}): SlackMessage {
  return {
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '📢 Paquete Enviado a Marketing',
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Paquete:*\n<${data.systemUrl}/packages/${data.packageId}|${data.tcPackageId} - ${data.packageTitle}>`,
          },
          {
            type: 'mrkdwn',
            text: `*Enviado por:*\n${data.sentBy}`,
          },
        ],
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `📦 ${data.creativesCount} creativos disponibles para crear anuncios`,
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: 'Ver en Marketing' },
            url: `${data.systemUrl}/packages/marketing?search=${data.tcPackageId}`,
          },
        ],
      },
    ],
  }
}

/**
 * Aviso consolidado de tareas vencidas (cotización manual o diseño).
 *
 * Un solo builder para los dos casos: cambia a quién se menciona, el texto y a
 * qué pantalla lleva el botón, pero la forma del mensaje es la misma.
 */
export function buildDeadlineSummaryMessage(data: {
  kind: 'requote' | 'design'
  items: Array<{
    packageId: number
    tcPackageId: number
    packageTitle: string
    deadline: string
    hoursOverdue: number
  }>
  systemUrl: string
  mentionUsers?: string
}): SlackMessage {
  const count = data.items.length
  const isRequote = data.kind === 'requote'

  const title = isRequote
    ? `⏰ ${count} cotización${count > 1 ? 'es' : ''} manual${count > 1 ? 'es' : ''} vencida${count > 1 ? 's' : ''}`
    : `⏰ ${count} pedido${count > 1 ? 's' : ''} de diseño vencido${count > 1 ? 's' : ''}`

  const intro = isRequote
    ? `pasaron más de 48 h desde que ${count > 1 ? 'estos paquetes entraron' : 'este paquete entró'} a revisión de cotización manual y sigue${count > 1 ? 'n' : ''} sin resolver:`
    : `pasaron más de 48 h desde que se pidió el creativo y sigue${count > 1 ? 'n' : ''} sin completar:`

  const list = data.items
    .map(item => {
      const overdue = item.hoursOverdue >= 48
        ? `${Math.round(item.hoursOverdue / 24)} d`
        : `${Math.round(item.hoursOverdue)} h`
      return `• <${data.systemUrl}/packages/${item.packageId}|${item.tcPackageId}> - ${item.packageTitle}\n   venció hace ${overdue}`
    })
    .join('\n')

  const ctaPath = isRequote ? '/tareas' : '/packages/design'
  const ctaLabel = isRequote ? 'Ir a Tareas pendientes' : 'Ir a Diseño'

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: title, emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: data.mentionUsers ? `${data.mentionUsers} — ${intro}` : intro.charAt(0).toUpperCase() + intro.slice(1),
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: list },
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: ctaLabel },
          url: `${data.systemUrl}${ctaPath}`,
        },
      ],
    },
  ]

  return {
    blocks,
    attachments: [{ color: '#e74c3c' }],
  }
}

/**
 * Aviso a marketing cuando un paquete se da de baja porque su cupo se agotó.
 * El texto "dar de baja, el paquete ID X" es el que pidió el equipo.
 */
export function buildCupoSoldOutMessage(data: {
  packageId: number
  tcPackageId: number
  packageTitle: string
  flightLabel: string
  departureDate: string
  cuposTotal: number
  systemUrl: string
  requestedByEmail?: string | null
}): SlackMessage {
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '🚫 Cupo agotado — dar de baja', emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*dar de baja, el paquete ID ${data.tcPackageId}*\n${data.packageTitle}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Cupo*\n${data.flightLabel}` },
        { type: 'mrkdwn', text: `*Salida*\n${data.departureDate}` },
        { type: 'mrkdwn', text: `*Lugares*\n0 de ${data.cuposTotal} disponibles` },
        { type: 'mrkdwn', text: `*Dado de baja por*\n${data.requestedByEmail || 'sistema'}` },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'El paquete ya fue desactivado en TravelCompositor. Falta bajar los anuncios que lo estén promocionando.',
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: 'Ver Paquete' },
          url: `${data.systemUrl}/packages/${data.packageId}`,
        },
      ],
    },
  ]

  return { blocks, attachments: [{ color: '#e74c3c' }] }
}
