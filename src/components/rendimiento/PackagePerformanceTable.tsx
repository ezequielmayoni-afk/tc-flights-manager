'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Loader2, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import type { PackagePerformanceRow } from '@/lib/crm/performance'

type Resp = { rows: PackagePerformanceRow[]; totals: Omit<PackagePerformanceRow, 'tcPackageId' | 'title' | 'status' | 'family'>; users: Array<{ id: string; name: string }>; teams: Array<{ id: string; name: string }>; lastRollupAt: string | null }
type Drill = { ads: Array<{ adId: string; name: string | null; variant: number | null; status: string | null; spend: number; impressions: number; clicks: number; conversationsStarted: number }>; users: Array<{ userId: string; name: string | null; contacts: number; opportunities: number; quotations: number; won: number; lost: number; revenue: number; profit: number }>; contacts: Array<Record<string, unknown>> }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const usd = (v: number | null) => (v === null ? '–' : `USD ${v.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)
const num = (v: number) => v.toLocaleString('es-AR')
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '–')

/** Fase 8: por paquete (ID SIV), qué gastamos en Meta y qué pasó en el CRM con la gente que escribió. Filtros obligatorios de fecha; vendedor y equipo opcionales. */
export function PackagePerformanceTable() {
  const [from, setFrom] = useState(iso(new Date(Date.now() - 30 * 86400000)))
  const [to, setTo] = useState(iso(new Date()))
  const [userId, setUserId] = useState('')
  const [teamId, setTeamId] = useState('')
  const [data, setData] = useState<Resp | null>(null)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const [drill, setDrill] = useState<Record<number, Drill>>({})

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const q = new URLSearchParams({ from, to }); if (userId) q.set('userId', userId); if (teamId) q.set('teamId', teamId)
      const res = await fetch(`/api/rendimiento/paquetes?${q}`)
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No se pudo cargar'); return }
      setData(d)
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }, [from, to, userId, teamId])
  useEffect(() => { load() }, [load])

  const toggle = async (id: number) => {
    if (open === id) { setOpen(null); return }
    setOpen(id)
    if (!drill[id]) {
      const res = await fetch(`/api/rendimiento/paquetes/${id}?from=${from}&to=${to}`)
      if (res.ok) { const d = (await res.json()) as Drill; setDrill(prev => ({ ...prev, [id]: d })) }
    }
  }

  const t = data?.totals
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 bg-white border rounded-lg p-3">
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Desde</span><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="block h-8 rounded border px-2 text-sm" /></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Hasta</span><input type="date" value={to} onChange={e => setTo(e.target.value)} className="block h-8 rounded border px-2 text-sm" /></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Vendedor</span><select value={userId} onChange={e => { setUserId(e.target.value); if (e.target.value) setTeamId('') }} className="block h-8 rounded border px-2 text-sm min-w-[160px]"><option value="">Todos</option>{data?.users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <label className="text-xs space-y-1"><span className="text-muted-foreground">Equipo</span><select value={teamId} onChange={e => { setTeamId(e.target.value); if (e.target.value) setUserId('') }} className="block h-8 rounded border px-2 text-sm min-w-[160px]"><option value="">Todos</option>{data?.teams.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
        <span className="flex-1" />
        {data?.lastRollupAt && <span className="text-xs text-muted-foreground">CRM leído: {new Date(data.lastRollupAt).toLocaleString('es-AR')}</span>}
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}</Button>
      </div>

      {t && (
        <div className="grid gap-3 md:grid-cols-6">
          {[['Gasto Meta', usd(t.spend)], ['Conversaciones (Meta)', num(t.conversationsStarted)], ['Contactos con SIV', num(t.contactsNew)], ['Ganadas', `${num(t.won)} · ${pct(t.won, t.contactsNew)}`], ['Costo por contacto', usd(t.costPerContact)], ['Costo por venta', usd(t.costPerWon)]].map(([l, v]) => (
            <div key={l} className="bg-white border rounded-lg p-3"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{l}</p><p className="text-xl font-semibold tabular-nums">{v}</p></div>
          ))}
        </div>
      )}

      <div className="bg-white border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr><th className="px-2 py-2"></th><th className="px-2 py-2 text-left">Paquete</th><th className="px-2 py-2 text-right">Gasto</th><th className="px-2 py-2 text-right">Conv. Meta</th><th className="px-2 py-2 text-right">Contactos SIV</th><th className="px-2 py-2 text-right">Oportun.</th><th className="px-2 py-2 text-right">Cotizados</th><th className="px-2 py-2 text-right">Ganadas</th><th className="px-2 py-2 text-right">Perdidas</th><th className="px-2 py-2 text-right">$/contacto</th><th className="px-2 py-2 text-right">$/venta</th><th className="px-2 py-2 text-right">Ingresos</th><th className="px-2 py-2 text-right">Margen</th><th className="px-2 py-2 text-right">ROAS margen</th></tr>
          </thead>
          <tbody className="divide-y">
            {!data && <tr><td colSpan={14} className="px-3 py-8 text-center text-muted-foreground">{loading ? 'Cargando…' : 'Elegí un rango'}</td></tr>}
            {data?.rows.length === 0 && <tr><td colSpan={14} className="px-3 py-8 text-center text-muted-foreground">Sin datos en el rango</td></tr>}
            {data?.rows.map(r => (
              <Fragment key={r.tcPackageId}>
                <tr className="hover:bg-muted/30 cursor-pointer" onClick={() => toggle(r.tcPackageId)}>
                  <td className="px-2 py-2 text-muted-foreground">{open === r.tcPackageId ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                  <td className="px-2 py-2"><div className="font-medium">{r.title ?? 'Paquete sin importar'}</div><div className="text-[11px] text-muted-foreground"><Link href={`/packages?q=${r.tcPackageId}`} onClick={e => e.stopPropagation()} className="font-mono hover:underline">{r.tcPackageId}</Link>{r.family ? ` · ${r.family}` : ''}{r.status ? ` · ${r.status}` : ''}</div></td>
                  <td className="px-2 py-2 text-right tabular-nums">{usd(r.spend)}</td><td className="px-2 py-2 text-right tabular-nums">{num(r.conversationsStarted)}</td><td className="px-2 py-2 text-right tabular-nums font-medium">{num(r.contactsNew)}</td><td className="px-2 py-2 text-right tabular-nums">{num(r.opportunitiesCreated)}</td><td className="px-2 py-2 text-right tabular-nums">{num(r.quotationsSent)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-green-700 font-medium">{num(r.won)}</td><td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{num(r.lost)}</td><td className="px-2 py-2 text-right tabular-nums">{usd(r.costPerContact)}</td><td className="px-2 py-2 text-right tabular-nums">{usd(r.costPerWon)}</td><td className="px-2 py-2 text-right tabular-nums">{usd(r.revenueWon)}</td><td className="px-2 py-2 text-right tabular-nums">{usd(r.profitWon)}</td><td className="px-2 py-2 text-right tabular-nums">{r.roasMargin === null ? '–' : `${r.roasMargin}×`}</td>
                </tr>
                {open === r.tcPackageId && (
                  <tr className="bg-muted/20"><td colSpan={14} className="px-4 py-3">
                    {!drill[r.tcPackageId] ? <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Cargando detalle…</span> : (
                      <div className="grid md:grid-cols-2 gap-4 text-xs">
                        <div><p className="font-semibold mb-1">Anuncios</p>{drill[r.tcPackageId].ads.length === 0 ? <p className="text-muted-foreground">Sin gasto registrado en el rango</p> : <table className="w-full"><thead className="text-muted-foreground"><tr><th className="text-left py-1">Anuncio</th><th className="text-right">Gasto</th><th className="text-right">Conv.</th><th className="text-right">$/conv</th></tr></thead><tbody>{drill[r.tcPackageId].ads.map(a => <tr key={a.adId}><td className="py-1">{a.name ?? a.adId}{a.variant ? ` · V${a.variant}` : ''}{a.status ? ` · ${a.status}` : ''}</td><td className="text-right tabular-nums">{usd(a.spend)}</td><td className="text-right tabular-nums">{num(a.conversationsStarted)}</td><td className="text-right tabular-nums">{a.conversationsStarted ? usd(a.spend / a.conversationsStarted) : '–'}</td></tr>)}</tbody></table>}</div>
                        <div><p className="font-semibold mb-1">Vendedores</p>{drill[r.tcPackageId].users.length === 0 ? <p className="text-muted-foreground">Sin contactos asignados</p> : <table className="w-full"><thead className="text-muted-foreground"><tr><th className="text-left py-1">Vendedor</th><th className="text-right">Contactos</th><th className="text-right">Cotizados</th><th className="text-right">Ganadas</th><th className="text-right">Perdidas</th><th className="text-right">Margen</th></tr></thead><tbody>{drill[r.tcPackageId].users.map(u => <tr key={u.userId}><td className="py-1">{u.name ?? u.userId}</td><td className="text-right tabular-nums">{num(u.contacts)}</td><td className="text-right tabular-nums">{num(u.quotations)}</td><td className="text-right tabular-nums text-green-700">{num(u.won)}</td><td className="text-right tabular-nums">{num(u.lost)}</td><td className="text-right tabular-nums">{usd(u.profit)}</td></tr>)}</tbody></table>}</div>
                      </div>
                    )}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Contactos SIV = personas que mandaron el código del paquete por WhatsApp en el rango (fecha del primer mensaje). Gasto y conversaciones vienen de Meta por día del anuncio; oportunidades, cotizaciones y ventas del CRM, por cohorte de ese contacto. El rollup corre cada noche y reprocesa 7 días.</p>
    </div>
  )
}
