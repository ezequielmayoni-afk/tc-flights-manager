/**
 * Reglas del guard de marketing. Puras: reciben el estado de un paquete con
 * sus anuncios, vínculos de cupo, salidas hermanas e insights, y devuelven
 * decisiones. Quién las aplica y en qué modo lo decide evaluate.ts.
 *
 *   expired / not_visible / tc_inactive  → pausar (o redirigir si hay otra salida)
 *   sold_out (vínculo confirmado o alta) → redirigir si hay otra salida; si no, pausar
 *   sold_out con vínculo media            → sólo avisar (la tarea de cupos agotados ya existe)
 *   price_drift                           → pedir creatividad; pausar sólo si el precio subió
 *   underperforming                       → sólo avisar
 */

export type GuardRule = 'expired' | 'not_visible' | 'tc_inactive' | 'sold_out' | 'sold_out_unconfirmed' | 'price_drift' | 'underperforming'
export type GuardAction = 'pause' | 'redirect' | 'request_creative' | 'alert' | 'hide_in_tc'
export type GuardSeverity = 'critical' | 'warning' | 'info'

export interface GuardPackage {
  id: number
  tcPackageId: number
  title: string
  status: string
  tcActive: boolean
  departureDate: string | null
  dateRangeEnd: string | null
  needsManualQuote: boolean
  currentPricePerPax: number | null
  priceAtCreativeCreation: number | null
  departureGroupId: string | null
  writeLockUntil: string | null
}

export interface GuardAd {
  metaAdId: string
  status: string
  autoManaged: boolean
  variant: number | null
}

export interface GuardLink {
  flightId: number
  flightLabel: string
  confidence: 'alta' | 'media' | 'baja'
  confirmed: boolean
  remainingSeats: number | null
  totalSeats: number | null
  keptVisible: boolean
}

export interface GuardSibling {
  packageId: number
  tcPackageId: number
  departureDate: string | null
  hasSeats: boolean
  sellable: boolean
}

export interface GuardInsights {
  days: number
  /** Gasto en USD (convertido si la cuenta factura en otra moneda). */
  spend: number
  spendLocal?: number
  currency?: string
  fxRate?: number | null
  impressions: number
  clicks: number
  conversations: number
  ctrPct: number | null
  /** Costo por conversación en USD; null si no hay conversaciones o no se pudo convertir. */
  costPerConversation: number | null
}

export interface GuardSettings {
  priceChangeThresholdPct: number
  ctrThresholdPct: number
  cplThreshold: number
  autoHideInTcOnSoldOut: boolean
}

export interface GuardInput {
  package: GuardPackage
  ads: GuardAd[]
  links: GuardLink[]
  siblings: GuardSibling[]
  insights: GuardInsights | null
  settings: GuardSettings
  /** yyyy-mm-dd en hora Argentina. */
  today: string
  /** Semana ISO, para no repetir avisos de rendimiento. */
  weekLabel: string
}

export interface GuardDecision {
  rule: GuardRule
  action: GuardAction
  severity: GuardSeverity
  reason: string
  dedupeKey: string
  /** Anuncio afectado; null si la decisión es del paquete (redirigir, ocultar, pedir creatividad). */
  metaAdId: string | null
  /** true = la regla no depende de rendimiento: en semi/auto se aplica sola. */
  deterministic: boolean
  inputs: Record<string, unknown>
}

const MIN_IMPRESSIONS_FOR_PERFORMANCE = 1000
const MIN_DAYS_FOR_PERFORMANCE = 7
const MIN_CONVERSATIONS_FOR_COST = 5

function activeAds(input: GuardInput): GuardAd[] {
  return input.ads.filter(a => a.status === 'ACTIVE' && a.autoManaged)
}

/** La siguiente salida del mismo producto con lugares: primero las posteriores a la actual, después cualquiera. */
function nextSibling(input: GuardInput): GuardSibling | null {
  const current = input.package.departureDate ?? ''
  const candidates = input.siblings
    .filter(s => s.sellable && s.hasSeats && s.packageId !== input.package.id && (s.departureDate ?? '') !== current)
    .sort((a, b) => (a.departureDate ?? '9999').localeCompare(b.departureDate ?? '9999'))
  return candidates.find(s => (s.departureDate ?? '') > current) ?? candidates[0] ?? null
}

/** Motivo por el que el paquete no debería seguir en pauta, si lo hay. */
function downReason(p: GuardPackage, today: string): { rule: 'expired' | 'not_visible' | 'tc_inactive'; reason: string } | null {
  if (p.status === 'not_visible') return { rule: 'not_visible', reason: 'El paquete está marcado como no visible' }
  if (p.status === 'expired') return { rule: 'expired', reason: 'El paquete está dado de baja (vencido)' }
  if (!p.tcActive) return { rule: 'tc_inactive', reason: 'El paquete está inactivo en Travel Compositor' }
  const end = p.dateRangeEnd ?? p.departureDate
  if (end && end < today) return { rule: 'expired', reason: `La última fecha de salida (${end}) ya pasó` }
  return null
}

function pauseAll(input: GuardInput, rule: GuardRule, reason: string, severity: GuardSeverity, extra: Record<string, unknown> = {}): GuardDecision[] {
  return activeAds(input).map(ad => ({
    rule,
    action: 'pause',
    severity,
    reason,
    dedupeKey: `guard:${rule}:ad:${ad.metaAdId}`,
    metaAdId: ad.metaAdId,
    deterministic: true,
    inputs: { packageId: input.package.id, tcPackageId: input.package.tcPackageId, variant: ad.variant, ...extra },
  }))
}

function redirectTo(input: GuardInput, rule: GuardRule, sibling: GuardSibling, reason: string, extra: Record<string, unknown> = {}): GuardDecision[] {
  const p = input.package
  return [
    {
      rule,
      action: 'redirect',
      severity: 'warning',
      reason: `${reason}. Hay lugar en la salida del ${sibling.departureDate ?? 's/f'} (SIV ${sibling.tcPackageId}): el bot del CRM va a responder con esa`,
      dedupeKey: `guard:redirect:pkg:${p.id}:${sibling.tcPackageId}`,
      metaAdId: null,
      deterministic: true,
      inputs: { packageId: p.id, fromTcPackageId: p.tcPackageId, toPackageId: sibling.packageId, toTcPackageId: sibling.tcPackageId, toDepartureDate: sibling.departureDate, ...extra },
    },
    {
      rule,
      action: 'request_creative',
      severity: 'info',
      reason: `Creatividad nueva con la fecha ${sibling.departureDate ?? 'siguiente'} para relanzar el anuncio con SIV ${sibling.tcPackageId}`,
      dedupeKey: `guard:creative:sold_out_departure:${p.id}:${sibling.tcPackageId}`,
      metaAdId: null,
      deterministic: true,
      inputs: { packageId: p.id, tcPackageId: p.tcPackageId, toTcPackageId: sibling.tcPackageId, toDepartureDate: sibling.departureDate, creativeReason: 'sold_out_departure', ...extra },
    },
  ]
}

export function evaluatePackage(input: GuardInput): GuardDecision[] {
  const p = input.package
  const ads = activeAds(input)
  if (ads.length === 0) return []
  if (p.writeLockUntil && p.writeLockUntil > new Date().toISOString()) return []

  // 1. Paquete que no debería estar en pauta
  const down = downReason(p, input.today)
  if (down) {
    const sibling = nextSibling(input)
    if (sibling) return redirectTo(input, down.rule, sibling, down.reason)
    return pauseAll(input, down.rule, down.reason, 'critical')
  }

  // 2. Cupo agotado
  const soldOutLinks = input.links.filter(l => l.remainingSeats !== null && l.totalSeats !== null && l.totalSeats > 0 && l.remainingSeats <= 0 && !l.keptVisible)
  const confirmedSoldOut = soldOutLinks.filter(l => l.confirmed || l.confidence === 'alta')
  const unconfirmedSoldOut = soldOutLinks.filter(l => !l.confirmed && l.confidence !== 'alta')
  if (confirmedSoldOut.length > 0) {
    const link = confirmedSoldOut[0]
    const reason = `El cupo ${link.flightLabel} se agotó (${link.totalSeats} lugares vendidos)`
    const sibling = nextSibling(input)
    if (sibling) return redirectTo(input, 'sold_out', sibling, reason, { flightId: link.flightId })
    const decisions = pauseAll(input, 'sold_out', reason, 'critical', { flightId: link.flightId })
    if (input.settings.autoHideInTcOnSoldOut) {
      decisions.push({
        rule: 'sold_out',
        action: 'hide_in_tc',
        severity: 'warning',
        reason: `${reason}: ocultar el paquete en Travel Compositor`,
        dedupeKey: `guard:hide_in_tc:pkg:${p.id}`,
        metaAdId: null,
        deterministic: true,
        inputs: { packageId: p.id, tcPackageId: p.tcPackageId, flightId: link.flightId },
      })
    }
    return decisions
  }
  if (unconfirmedSoldOut.length > 0) {
    const link = unconfirmedSoldOut[0]
    return [{
      rule: 'sold_out_unconfirmed',
      action: 'alert',
      severity: 'warning',
      reason: `El cupo ${link.flightLabel} parece agotado pero el vínculo con el paquete es de confianza media: confirmarlo o rechazarlo`,
      dedupeKey: `guard:sold_out_unconfirmed:pkg:${p.id}:${link.flightId}`,
      metaAdId: null,
      deterministic: false,
      inputs: { packageId: p.id, tcPackageId: p.tcPackageId, flightId: link.flightId, confidence: link.confidence },
    }]
  }

  const decisions: GuardDecision[] = []

  // 3. El precio se movió respecto de la creatividad
  if (p.priceAtCreativeCreation && p.currentPricePerPax && p.priceAtCreativeCreation > 0) {
    const deltaPct = Math.round(((p.currentPricePerPax - p.priceAtCreativeCreation) / p.priceAtCreativeCreation) * 1000) / 10
    if (Math.abs(deltaPct) >= input.settings.priceChangeThresholdPct) {
      const rose = deltaPct > 0
      const priceKey = Math.round(p.currentPricePerPax)
      decisions.push({
        rule: 'price_drift',
        action: 'request_creative',
        severity: rose ? 'warning' : 'info',
        reason: `El precio ${rose ? 'subió' : 'bajó'} ${Math.abs(deltaPct)} % desde que se hizo la creatividad (USD ${p.priceAtCreativeCreation} → ${p.currentPricePerPax})`,
        dedupeKey: `guard:creative:price_change:${p.id}:${priceKey}`,
        metaAdId: null,
        deterministic: true,
        inputs: { packageId: p.id, tcPackageId: p.tcPackageId, deltaPct, from: p.priceAtCreativeCreation, to: p.currentPricePerPax, creativeReason: 'price_change' },
      })
      if (rose) {
        for (const ad of ads) {
          decisions.push({
            rule: 'price_drift',
            action: 'pause',
            severity: 'warning',
            reason: `El anuncio promete USD ${p.priceAtCreativeCreation} y el paquete vale USD ${p.currentPricePerPax} (+${deltaPct} %)`,
            dedupeKey: `guard:price_drift:ad:${ad.metaAdId}:${priceKey}`,
            metaAdId: ad.metaAdId,
            deterministic: false,
            inputs: { packageId: p.id, tcPackageId: p.tcPackageId, deltaPct, from: p.priceAtCreativeCreation, to: p.currentPricePerPax },
          })
        }
      }
    }
  }

  // 4. Rendimiento: un solo aviso por paquete y por semana, con datos suficientes (los insights son del paquete entero)
  const ins = input.insights
  if (ins && ins.days >= MIN_DAYS_FOR_PERFORMANCE && ins.impressions >= MIN_IMPRESSIONS_FOR_PERFORMANCE) {
    const lowCtr = ins.ctrPct !== null && ins.ctrPct < input.settings.ctrThresholdPct
    const highCpc = ins.costPerConversation !== null && ins.conversations >= MIN_CONVERSATIONS_FOR_COST && ins.costPerConversation > input.settings.cplThreshold
    if (lowCtr || highCpc) {
      decisions.push({
        rule: 'underperforming',
        action: 'alert',
        severity: 'info',
        reason: [lowCtr ? `CTR ${ins.ctrPct} % (umbral ${input.settings.ctrThresholdPct} %)` : null, highCpc ? `costo por conversación USD ${ins.costPerConversation} (umbral USD ${input.settings.cplThreshold}) en ${ins.days} días` : null].filter(Boolean).join(' · '),
        dedupeKey: `guard:underperforming:pkg:${p.id}:${input.weekLabel}`,
        metaAdId: null,
        deterministic: false,
        inputs: { packageId: p.id, tcPackageId: p.tcPackageId, ads: ads.length, ...ins },
      })
    }
  }

  return decisions
}
