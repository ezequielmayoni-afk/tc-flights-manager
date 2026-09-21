'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Loader2, Plane } from 'lucide-react'
import { publicPackageUrl } from '@/lib/packages/public-url'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { REGION_LABELS, type CupoRegion, type CupoSummaryRow } from '@/lib/cupos/summary'

const REGION_ORDER: CupoRegion[] = ['brasil', 'caribe', 'europa', 'medio_oriente_asia', 'usa', 'argentina', 'otros']
const STATUS_STYLE: Record<CupoSummaryRow['status'], { cell: string; label: string }> = {
  agotado: { cell: 'text-slate-400', label: 'Agotado' },
  ultimos: { cell: 'text-red-600', label: 'Últimos' },
  pocos: { cell: 'text-amber-600', label: 'Pocos' },
  ok: { cell: 'text-green-700', label: '' },
}

const PKG_STATUS: Record<string, { label: string; cls: string }> = {
  imported: { label: 'Importado', cls: 'bg-gray-100 text-gray-700' },
  reviewing: { label: 'En revisión', cls: 'bg-blue-100 text-blue-700' },
  approved: { label: 'Aprobado', cls: 'bg-green-100 text-green-700' },
  in_design: { label: 'En diseño', cls: 'bg-purple-100 text-purple-700' },
  in_marketing: { label: 'En marketing', cls: 'bg-orange-100 text-orange-700' },
  published: { label: 'Publicado', cls: 'bg-emerald-100 text-emerald-700' },
  expired: { label: 'Vencido', cls: 'bg-red-100 text-red-700' },
  not_visible: { label: 'No visible', cls: 'bg-slate-200 text-slate-700' },
}

const fmt = (d: string) => format(new Date(`${d}T12:00:00`), 'dd MMM yyyy', { locale: es })

/** Cuadro de lectura rápida: destino, fechas y lugares que quedan de cada salida con cupo. */
export function CuposSummary() {
  const [rows, setRows] = useState<CupoSummaryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [region, setRegion] = useState<CupoRegion | 'all'>('all')
  const [hideSoldOut, setHideSoldOut] = useState(false)

  useEffect(() => {
    fetch('/api/dashboard/cupos').then(async res => {
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'No se pudieron cargar los cupos'); return }
      setRows(data.rows ?? [])
    }).catch(() => setError('Error de conexión')).finally(() => setLoading(false))
  }, [])

  const regions = useMemo(() => REGION_ORDER.filter(r => rows.some(x => x.region === r)), [rows])
  const visible = useMemo(() => rows.filter(r => (region === 'all' || r.region === region) && (!hideSoldOut || r.remaining > 0)), [rows, region, hideSoldOut])
  const totals = useMemo(() => visible.reduce((acc, r) => ({ total: acc.total + r.total, sold: acc.sold + r.sold, remaining: acc.remaining + r.remaining }), { total: 0, sold: 0, remaining: 0 }), [visible])
  const countFor = (r: CupoRegion | 'all') => rows.filter(x => (r === 'all' || x.region === r) && (!hideSoldOut || x.remaining > 0)).length

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="flex items-center gap-2 text-lg"><Plane className="h-5 w-5 text-blue-600" />Cupos por salida</CardTitle>
          <span className="text-sm text-muted-foreground">{visible.length} salida{visible.length === 1 ? '' : 's'} · quedan <strong className="text-foreground">{totals.remaining}</strong> de {totals.total} lugares</span>
          <span className="flex-1" />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={hideSoldOut} onChange={e => setHideSoldOut(e.target.checked)} />Ocultar agotados
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-2">
          {(['all', ...regions] as Array<CupoRegion | 'all'>).map(r => (
            <button key={r} type="button" onClick={() => setRegion(r)} className={`px-3 py-1 rounded-full text-xs border transition-colors ${region === r ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-muted'}`}>
              {r === 'all' ? 'Todos' : REGION_LABELS[r]} <span className={region === r ? 'opacity-80' : 'text-muted-foreground'}>{countFor(r)}</span>
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Cargando cupos…</div>
        ) : error ? (
          <p className="text-sm text-red-600 py-6 text-center">{error}</p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No hay salidas con cupo para mostrar</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Destino</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Regreso</TableHead>
                <TableHead>Aerolínea</TableHead>
                <TableHead>Paquete</TableHead>
                <TableHead className="text-right">Quedan</TableHead>
                <TableHead className="text-right">Vendidos</TableHead>
                <TableHead className="w-32">Ocupación</TableHead>
                <TableHead className="text-right">Faltan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map(r => {
                const st = STATUS_STYLE[r.status]
                const pct = r.total > 0 ? Math.round((r.sold / r.total) * 100) : 0
                return (
                  <TableRow key={r.flightId} className={r.status === 'agotado' ? 'opacity-60' : ''}>
                    <TableCell>
                      <Link href={`/flights/${r.flightId}`} className="font-medium hover:underline">{r.destination}</Link>
                      <div className="text-[11px] text-muted-foreground">{REGION_LABELS[r.region]}{r.origin ? ` · desde ${r.origin}` : ''}{r.name ? ` · ${r.name}` : ''}</div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{fmt(r.departureDate)}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{r.returnDate ? fmt(r.returnDate) : '–'}</TableCell>
                    <TableCell className="text-muted-foreground">{r.airlineCode ?? '–'}</TableCell>
                    <TableCell>
                      {r.packages.length === 0 ? (
                        <span className="text-xs text-muted-foreground" title="Ningún paquete de siviajo.com está vinculado a este cupo">Sin paquete</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {r.packages.map(p => {
                            const ps = PKG_STATUS[p.displayStatus] ?? { label: p.displayStatus, cls: 'bg-gray-100 text-gray-700' }
                            return (
                              <div key={p.id} className="flex items-center gap-1.5 whitespace-nowrap" title={p.title}>
                                <Link href={`/packages?q=${p.tcPackageId}`} className="font-mono text-xs hover:underline">{p.tcPackageId}</Link>
                                <a href={publicPackageUrl(p.tcPackageId, p.title)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Ver en siviajo.com"><ExternalLink className="h-3 w-3" /></a>
                                <Badge className={`${ps.cls} text-[10px]`}>{ps.label}</Badge>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className={`text-right text-lg font-bold tabular-nums ${st.cell}`}>
                      {r.remaining}
                      {st.label && <Badge className={`ml-2 text-[10px] ${r.status === 'agotado' ? 'bg-slate-100 text-slate-500' : r.status === 'ultimos' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{st.label}</Badge>}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">{r.sold} / {r.total}</TableCell>
                    <TableCell>
                      <div className="h-2 rounded bg-muted overflow-hidden" title={`${pct}% vendido`}>
                        <div className={`h-full ${pct >= 100 ? 'bg-slate-400' : pct >= 60 ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${Math.min(100, pct)}%` }} />
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap text-muted-foreground">{r.daysToDeparture} días</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
