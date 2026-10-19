import { addDays } from '@/lib/vuelos-baratos/date-pairs'

/**
 * Fichas con tráfico orgánico cuya salida vence (Fase 14).
 *
 * En TC desactivar una ficha es un 404 sin redirección: si tenía impresiones
 * en Google, se pierde lo ganado. Esta regla decide qué fichas avisar para que
 * alguien les cargue la próxima salida o las pase a sistema. Puro; el job
 * `seo.expiring` trae los datos y manda el aviso.
 */

export interface ExpiringCandidate {
  tcPackageId: number
  packageId: number | null
  title: string
  /** Salida (packages.departure_date). */
  departureDate: string | null
  /** Fin del rango de fechas (packages.date_range_end), si la ficha tiene varias salidas. */
  dateRangeEnd: string | null
  tcActive: boolean
  impressions: number
  clicks: number
  url: string | null
}

export interface ExpiringOptions {
  /** YYYY-MM-DD. */
  today: string
  /** Avisar cuando la última salida está a esta cantidad de días o menos. */
  daysAhead?: number
  /** Sólo fichas con al menos estas impresiones en la ventana (28 días). */
  minImpressions?: number
}

export interface ExpiringAlert extends ExpiringCandidate {
  /** Última fecha de salida conocida. */
  lastDate: string
  /** Días hasta esa fecha; negativo = ya venció. */
  daysLeft: number
  reason: 'vencida' | 'por_vencer'
}

function diasEntre(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000)
}

export function findExpiring(candidates: ExpiringCandidate[], opts: ExpiringOptions): ExpiringAlert[] {
  const { today, daysAhead = 7, minImpressions = 20 } = opts
  const limite = addDays(today, daysAhead)
  const out: ExpiringAlert[] = []
  for (const c of candidates) {
    if (!c.tcActive || c.impressions < minImpressions) continue
    const fechas = [c.departureDate, c.dateRangeEnd].filter((d): d is string => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d))
    if (fechas.length === 0) continue
    const lastDate = fechas.sort().at(-1)!
    if (lastDate > limite) continue
    const daysLeft = diasEntre(today, lastDate)
    out.push({ ...c, lastDate, daysLeft, reason: daysLeft < 0 ? 'vencida' : 'por_vencer' })
  }
  // Primero lo que más tráfico tiene; entre iguales, lo que vence antes.
  return out.sort((a, b) => b.impressions - a.impressions || a.daysLeft - b.daysLeft)
}

/** Texto del aviso de Slack (sólo las alertas nuevas de hoy). */
export function buildExpiringMessage(alerts: ExpiringAlert[], hubUrl = 'https://hub.siviajo.com'): string {
  const lines = alerts.map(a => {
    const cuando = a.daysLeft < 0 ? `venció hace ${-a.daysLeft} d` : a.daysLeft === 0 ? 'vence hoy' : `vence en ${a.daysLeft} d`
    const link = a.url ?? `https://www.siviajo.com/es/idea/${a.tcPackageId}/x`
    return `• <${link}|${a.title}> — ${cuando} (${a.lastDate}) · ${a.impressions} impresiones y ${a.clicks} clics en 28 d`
  })
  return (
    `🔎 SEO: ${alerts.length} ficha${alerts.length === 1 ? '' : 's'} con tráfico en Google ${alerts.length === 1 ? 'vence' : 'vencen'} o ya ${alerts.length === 1 ? 'venció' : 'vencieron'}. ` +
    `Cargarles la próxima salida o pasarlas a sistema; NO desactivar (en TC es un 404 y se pierde el posicionamiento).\n${lines.join('\n')}\nVer: ${hubUrl}/tareas`
  )
}
