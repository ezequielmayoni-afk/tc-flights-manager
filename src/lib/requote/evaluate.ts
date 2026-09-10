/**
 * Qué hacer con el precio recotizado de un paquete. Misma regla que tenía el
 * tc-requote-bot: sube más que el umbral → revisión manual; si no, queda al
 * día. Lo que cambia es que ya no se guarda nada en siviajo.com: si bajó, se
 * avisa para que alguien actualice la idea a mano.
 */

export type RequoteStatus = 'needs_manual' | 'completed' | 'pending'
export type RequoteAction = 'marked_manual' | 'no_change' | 'price_dropped' | 'error'

export interface RequoteEvaluationInput {
  /** target_price, o current_price_per_pax si no hay objetivo. */
  referencePrice: number | null
  newPrice: number | null
  thresholdPct: number
  hotelMatched: boolean
  expectedHotel: string | null
  quotedHotel: string | null
  /** `status` del cotizador (ok, sin_disponibilidad, timeout…). */
  quoteStatus: string
  diagnostico?: string | null
}

export interface RequoteEvaluation {
  status: RequoteStatus
  action: RequoteAction
  variancePct: number | null
  note: string
}

const pct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}%`
const usd = (v: number) => `USD ${Math.round(v).toLocaleString('es-AR')}`

export function evaluateRequote(i: RequoteEvaluationInput): RequoteEvaluation {
  if (i.quoteStatus !== 'ok' || i.newPrice === null || !Number.isFinite(i.newPrice)) {
    const detail = i.diagnostico ? `: ${i.diagnostico}` : ''
    return { status: 'pending', action: 'error', variancePct: null, note: `El cotizador no devolvió precio (${i.quoteStatus})${detail}` }
  }
  if (i.referencePrice === null || !(i.referencePrice > 0)) {
    return { status: 'pending', action: 'error', variancePct: null, note: 'Sin precio de referencia: cargá el precio objetivo del paquete' }
  }
  const variancePct = Math.round(((i.newPrice - i.referencePrice) / i.referencePrice) * 10000) / 100
  if (!i.hotelMatched) {
    const expected = i.expectedHotel ?? 'del paquete'
    const closest = i.quotedHotel ? `la opción más cercana fue ${i.quotedHotel} a ${usd(i.newPrice)} (${pct(variancePct)})` : `la más barata salió ${usd(i.newPrice)} (${pct(variancePct)})`
    return { status: 'needs_manual', action: 'marked_manual', variancePct, note: `El hotel ${expected} no apareció en la búsqueda; ${closest}` }
  }
  if (variancePct > i.thresholdPct) {
    return { status: 'needs_manual', action: 'marked_manual', variancePct, note: `Subió ${pct(variancePct)} sobre el objetivo (umbral ${i.thresholdPct}%): ${usd(i.referencePrice)} → ${usd(i.newPrice)}` }
  }
  if (variancePct < -i.thresholdPct) {
    return { status: 'completed', action: 'price_dropped', variancePct, note: `Bajó ${pct(variancePct)}: ${usd(i.referencePrice)} → ${usd(i.newPrice)}. Conviene actualizar la idea en siviajo.com` }
  }
  return { status: 'completed', action: 'no_change', variancePct, note: `Dentro del umbral (${pct(variancePct)}): ${usd(i.newPrice)} contra ${usd(i.referencePrice)}` }
}
