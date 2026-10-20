'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

type Stat = { code: string; name: string; covered: number; total: number; avgPp: number | null; minPp: number | null; maxPp: number | null; directShare: number; missingDates: string[]; history: { observations: number; medianPp: number | null; directShare: number | null; sources: Record<string, number>; flights: string[] } | null }
type Intel = { airport: string | null; keys: string[]; observations: number; marketPoints: number; demand: { botQuotes: number; webSearches: number; byMonth: Record<string, { botQuotes: number; webSearches: number }>; topDates: Array<{ date: string; count: number }> }; history: Array<{ code: string; name: string; observations: number; medianPp: number | null; directShare: number | null; sources: Record<string, number>; flights: string[] }> }
export type Analysis = { at: string; singleAirline: boolean; chosen: string | null; chosenName: string | null; reason: string; manual?: boolean; stats: Stat[]; intel: Intel | null; dates: unknown[] }

const SOURCE: Record<string, string> = { sondas: 'sondas', sabre: 'Sabre', web: 'web', bot: 'bot CRM' }
const fmtDay = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '–' : `${Math.round(x * 100)} %`)

/** Comparación de aerolíneas del sondeo + lo que ya sabemos de la ruta (historial, demanda). Permite cambiar de aerolínea sin volver a sondear. */
export function AirlineAnalysisPanel({ requestId, analysis, canChange, onChanged }: { requestId: number; analysis: Analysis; canChange: boolean; onChanged: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const change = async (code: string, name: string) => {
    if (!window.confirm(`¿Rearmar las tiradas con ${name}? No vuelve a consultar al cotizador.`)) return
    setBusy(code)
    try {
      const res = await fetch(`/api/cupos/requests/${requestId}/airline`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ airlineCode: code }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo'); return }
      toast.success(`${data.tiradas} tiradas con ${data.airline}`); onChanged()
    } catch { toast.error('Error de conexión') } finally { setBusy(null) }
  }
  const intel = analysis.intel
  const historyOnly = (intel?.history ?? []).filter(h => !analysis.stats.some(s => s.code === h.code)).slice(0, 4)
  return (
    <div className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="font-semibold">Aerolínea del pedido{analysis.chosenName ? `: ${analysis.chosenName}` : ''}</h2>
        {analysis.manual && <span className="text-[11px] text-amber-700">elegida a mano</span>}
        {!analysis.singleAirline && <span className="text-[11px] text-muted-foreground">(el pedido permite aerolíneas distintas por tirada)</span>}
      </div>
      {analysis.reason && <p className="text-sm text-muted-foreground">{analysis.reason}</p>}
      {analysis.stats.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase text-muted-foreground"><tr className="border-b">
              <th className="py-1.5 pr-3 text-left">Aerolínea</th><th className="py-1.5 pr-3 text-right">Fechas con opción</th><th className="py-1.5 pr-3 text-right">Promedio pp</th><th className="py-1.5 pr-3 text-right">Mín – máx</th><th className="py-1.5 pr-3 text-right">Directos</th><th className="py-1.5 pr-3 text-left">Historial de la ruta</th><th />
            </tr></thead>
            <tbody className="divide-y">
              {analysis.stats.slice(0, 8).map(s => (
                <tr key={s.code} className={s.code === analysis.chosen ? 'bg-blue-50/60' : ''}>
                  <td className="py-1.5 pr-3"><span className="font-medium">{s.name}</span> <span className="text-[11px] text-muted-foreground">{s.code}</span></td>
                  <td className="py-1.5 pr-3 text-right tabular-nums" title={s.missingDates.length ? `Sin opción: ${s.missingDates.join(', ')}` : undefined}>{s.covered}/{s.total}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{s.avgPp !== null ? `USD ${s.avgPp}` : '–'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{s.minPp !== null ? `${s.minPp} – ${s.maxPp}` : '–'}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{pct(s.directShare)}</td>
                  <td className="py-1.5 pr-3 text-xs text-muted-foreground">{s.history ? `${s.history.observations} precios · mediana USD ${s.history.medianPp ?? '–'} · ${Object.entries(s.history.sources).map(([k, v]) => `${SOURCE[k] ?? k} ${v}`).join(', ')}${s.history.flights.length ? ` · ${s.history.flights.join(' ')}` : ''}` : 'sin historial'}</td>
                  <td className="py-1.5 text-right">{canChange && s.code !== analysis.chosen && s.covered > 0 && <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy !== null} onClick={() => change(s.code, s.name)}>{busy === s.code ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Usar esta'}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {intel && (
        <div className="rounded border bg-muted/20 p-3 text-xs space-y-1.5">
          <div className="font-medium text-sm">Lo que ya sabemos de la ruta {intel.airport ? `(${intel.airport})` : ''}</div>
          <div>{intel.observations} precios observados en los últimos 60 días (sondas, Sabre, búsquedas en siviajo.com y cotizaciones del bot) · {intel.marketPoints} fechas con precio de mercado.</div>
          <div>Demanda: <b>{intel.demand.botQuotes}</b> cotizaciones del bot y <b>{intel.demand.webSearches}</b> búsquedas en la web para estos meses{Object.keys(intel.demand.byMonth).length ? ` (${Object.entries(intel.demand.byMonth).sort().map(([m, v]) => `${fmtMonth(m)}: ${v.botQuotes + v.webSearches}`).join(' · ')})` : ''}.</div>
          {intel.demand.topDates.length > 0 && <div>Fechas más pedidas: {intel.demand.topDates.map(d => `${fmtDay(d.date)} (${d.count})`).join(', ')}.</div>}
          {historyOnly.length > 0 && <div>Otras aerolíneas en la ruta: {historyOnly.map(h => `${h.name} (${h.observations} precios, mediana USD ${h.medianPp ?? '–'}, directos ${pct(h.directShare)})`).join(' · ')}.</div>}
        </div>
      )}
    </div>
  )
}
