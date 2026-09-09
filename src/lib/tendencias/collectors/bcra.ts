/**
 * Tipo de cambio: BCRA (API pública v4, sin clave) + dólar blue de
 * argentinadatos.com para la brecha. El turismo emisivo se compra en dólares:
 * un salto del tipo de cambio o de la brecha adelanta una caída de consultas.
 */

const BCRA_BASE = 'https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias'
const BLUE_URL = 'https://api.argentinadatos.com/v1/cotizaciones/dolares/blue'
const TIMEOUT_MS = 15_000

/** Variables del BCRA: 4 = minorista promedio vendedor, 5 = mayorista de referencia (Com. A 3500). */
export const BCRA_SERIES = { minorista: 4, mayorista: 5 } as const

export interface FxPoint { fecha: string; valor: number }

export interface FxSummary {
  last: number | null
  lastDate: string | null
  weekAvg: number | null
  change7dPct: number | null
  change30dPct: number | null
}

export interface FxSignal {
  minorista: FxSummary
  mayorista: FxSummary
  blue: { last: number | null; lastDate: string | null; brechaPct: number | null }
  errors: string[]
}

export async function fetchBcraSeries(idVariable: number, desde: string, hasta: string): Promise<FxPoint[]> {
  const url = `${BCRA_BASE}/${idVariable}?desde=${desde}&hasta=${hasta}&limit=200`
  const response = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`BCRA ${response.status} en variable ${idVariable}`)
  const data = (await response.json()) as { results?: Array<{ idVariable: number; detalle: FxPoint[] }> }
  const detalle = data.results?.[0]?.detalle ?? []
  return detalle
    .map(p => ({ fecha: p.fecha, valor: Number(p.valor) }))
    .filter(p => Number.isFinite(p.valor))
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
}

async function fetchBlue(): Promise<FxPoint[]> {
  const response = await fetch(BLUE_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!response.ok) throw new Error(`argentinadatos ${response.status} en dólar blue`)
  const data = (await response.json()) as Array<{ fecha: string; venta: number }>
  return data.slice(-60).map(p => ({ fecha: p.fecha, valor: Number(p.venta) })).filter(p => Number.isFinite(p.valor))
}

function valueOnOrBefore(points: FxPoint[], date: string): number | null {
  let found: number | null = null
  for (const p of points) {
    if (p.fecha <= date) found = p.valor
    else break
  }
  return found
}

function pct(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null
  return Math.round(((now - before) / before) * 1000) / 10
}

/** Resume una serie ascendente por fecha en último valor, promedio de 7 días y variaciones. Puro. */
export function summarizeSeries(points: FxPoint[], asOf: Date = new Date()): FxSummary {
  if (points.length === 0) return { last: null, lastDate: null, weekAvg: null, change7dPct: null, change30dPct: null }
  const last = points[points.length - 1]
  const asOfStr = asOf.toISOString().slice(0, 10)
  const daysAgo = (n: number) => new Date(asOf.getTime() - n * 86_400_000).toISOString().slice(0, 10)
  const week = points.filter(p => p.fecha > daysAgo(7) && p.fecha <= asOfStr)
  const weekAvg = week.length ? Math.round((week.reduce((s, p) => s + p.valor, 0) / week.length) * 100) / 100 : null
  return {
    last: Math.round(last.valor * 100) / 100,
    lastDate: last.fecha,
    weekAvg,
    change7dPct: pct(last.valor, valueOnOrBefore(points, daysAgo(7))),
    change30dPct: pct(last.valor, valueOnOrBefore(points, daysAgo(30))),
  }
}

export async function collectFx(asOf: Date = new Date()): Promise<FxSignal> {
  const hasta = asOf.toISOString().slice(0, 10)
  const desde = new Date(asOf.getTime() - 45 * 86_400_000).toISOString().slice(0, 10)
  const errors: string[] = []
  const empty: FxSummary = { last: null, lastDate: null, weekAvg: null, change7dPct: null, change30dPct: null }

  const [minorista, mayorista, blue] = await Promise.all([
    fetchBcraSeries(BCRA_SERIES.minorista, desde, hasta).then(summarizeSeries).catch(err => { errors.push(`minorista: ${(err as Error).message}`); return empty }),
    fetchBcraSeries(BCRA_SERIES.mayorista, desde, hasta).then(summarizeSeries).catch(err => { errors.push(`mayorista: ${(err as Error).message}`); return empty }),
    fetchBlue().then(summarizeSeries).catch(err => { errors.push(`blue: ${(err as Error).message}`); return empty }),
  ])

  const brechaPct = blue.last !== null && mayorista.last ? Math.round(((blue.last - mayorista.last) / mayorista.last) * 1000) / 10 : null
  return { minorista, mayorista, blue: { last: blue.last, lastDate: blue.lastDate, brechaPct }, errors }
}
