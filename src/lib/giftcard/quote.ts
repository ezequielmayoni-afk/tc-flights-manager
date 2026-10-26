/**
 * Precios de la Gift Card: cálculo puro, sin dependencias de servidor (lo usan la API pública,
 * la pantalla de configuración de HUB y, vía /api/giftcard/config, el widget de la landing).
 *
 * contado = round(usd × tipo de cambio); total en n cuotas = round(contado × coef); cuota = round(total / n);
 * el total que se cobra es cuota × n para que lo que ve el cliente sea exactamente lo que paga.
 */
export interface GiftcardPlan { n: number; coef: number; enabled: boolean }
export interface PlanQuote { n: number; coef: number; installmentArs: number; totalArs: number }

export const PLAN_NS = [1, 3, 6, 9, 12] as const
export const DEFAULT_PLANS: GiftcardPlan[] = PLAN_NS.map((n) => ({ n, coef: 1, enabled: true }))

export function cashArs(usd: number, rate: number): number { return Math.round(usd * rate) }

export function quotePlans(cash: number, plans: GiftcardPlan[]): PlanQuote[] {
  return [...plans]
    .filter((p) => p.enabled && Number.isFinite(p.n) && p.n >= 1)
    .sort((a, b) => a.n - b.n)
    .map((p) => {
      const n = Math.round(p.n)
      const coef = n === 1 ? 1 : p.coef
      const installmentArs = Math.round(Math.round(cash * coef) / n)
      return { n, coef, installmentArs, totalArs: installmentArs * n }
    })
}

/** Valida lo que viene de la pantalla/BD: n entero 1..24 único, coef 0,5..5, 1 pago siempre presente y activo. */
export function normalizePlans(input: unknown): GiftcardPlan[] {
  const byN = new Map<number, GiftcardPlan>()
  for (const raw of Array.isArray(input) ? input : []) {
    const r = (raw ?? {}) as Record<string, unknown>
    const n = Math.round(Number(r.n)); const coef = Number(r.coef)
    if (!Number.isInteger(n) || n < 1 || n > 24) continue
    if (!Number.isFinite(coef) || coef < 0.5 || coef > 5) continue
    byN.set(n, { n, coef: n === 1 ? 1 : Math.round(coef * 10000) / 10000, enabled: r.enabled !== false })
  }
  const one = byN.get(1) ?? { n: 1, coef: 1, enabled: true }
  byN.set(1, { ...one, coef: 1, enabled: true })
  return [...byN.values()].sort((a, b) => a.n - b.n)
}

export function fmtArs(n: number): string { return '$ ' + Math.round(n).toLocaleString('es-AR') }
