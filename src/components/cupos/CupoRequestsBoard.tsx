'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, RefreshCw, Clock, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { REQUEST_STATUS_LABELS, type CupoRequest, type CupoRequestStatus } from '@/lib/cupos/requests'
import { NewCupoRequestDialog } from './NewCupoRequestDialog'

type Row = CupoRequest & { summary: { total: number; quoted: number; accepted: number; minSystem: number | null }; waitingHours: number | null; overdue: boolean }

const COLUMNS: Array<{ key: string; title: string; statuses: CupoRequestStatus[]; cls: string }> = [
  { key: 'armando', title: 'Armando tiradas', statuses: ['draft', 'probing', 'ready'], cls: 'border-slate-300' },
  { key: 'enviado', title: 'Esperando a aéreos', statuses: ['sent'], cls: 'border-amber-300' },
  { key: 'respondido', title: 'Respondido · decidir', statuses: ['answered', 'confirming'], cls: 'border-blue-300' },
  { key: 'confirmado', title: 'Confirmado · cargar cupo', statuses: ['confirmed'], cls: 'border-green-300' },
  { key: 'cerrado', title: 'Cargados y cerrados', statuses: ['loaded', 'closed'], cls: 'border-slate-200' },
]

const fmtMonth = (m: string) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('es-AR', { month: 'short', year: '2-digit' })

/** Tablero de pedidos de cupos a aéreos (Fase 7). Reemplaza el Excel "SALIDAS" y los mails. */
export function CupoRequestsBoard() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/cupos/requests')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudieron cargar los pedidos'); return }
      setRows(data.requests ?? [])
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!rows.some(r => r.status === 'probing')) return
    const t = setInterval(load, 20_000); return () => clearInterval(t)
  }, [rows, load])

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-sm text-muted-foreground">{rows.length} pedido{rows.length === 1 ? '' : 's'}. Las tiradas salen del cotizador (precio de sistema); aéreos contesta precio por plaza; vos aceptás y cargás el cupo.</p>
        <span className="flex-1" />
        <Button variant="ghost" size="sm" onClick={load}><RefreshCw className="h-4 w-4" /></Button>
        <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" />Nuevo pedido</Button>
      </div>
      {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground py-8"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div> : (
        <div className="grid gap-3 md:grid-cols-5">
          {COLUMNS.map(col => {
            const items = rows.filter(r => col.statuses.includes(r.status))
            return (
              <div key={col.key} className={`rounded-lg border-t-4 ${col.cls} bg-muted/30 p-2 min-h-[200px]`}>
                <div className="flex items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}<span>{items.length}</span></div>
                <div className="space-y-2">
                  {items.map(r => (
                    <Link key={r.id} href={`/flights/pedidos/${r.id}`} className="block bg-white border rounded-md p-3 hover:shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm leading-tight">{r.origin_code} → {r.destination_name}</div>
                        <span className="font-mono text-[10px] text-muted-foreground">#{r.id}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{r.months.map(fmtMonth).join(' · ')} · {r.nights} noches · {r.seats_requested} lugares</div>
                      <div className="mt-2 flex flex-wrap items-center gap-1">
                        <Badge variant="secondary" className="text-[10px]">{REQUEST_STATUS_LABELS[r.status]}</Badge>
                        {r.status === 'probing' && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                        {r.summary.total > 0 && <span className="text-[11px] text-muted-foreground">{r.summary.total} tiradas{r.summary.quoted ? ` · ${r.summary.quoted} con precio` : ''}{r.summary.accepted ? ` · ${r.summary.accepted} aceptadas` : ''}</span>}
                        {r.summary.minSystem !== null && <span className="text-[11px] text-muted-foreground">desde USD {Math.round(r.summary.minSystem)}</span>}
                      </div>
                      {r.status === 'sent' && r.waitingHours !== null && (
                        <div className={`mt-2 inline-flex items-center gap-1 text-[11px] ${r.overdue ? 'text-red-600' : 'text-amber-700'}`}>{r.overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}{r.overdue ? 'Vencido · ' : ''}{Math.round(r.waitingHours)} h esperando</div>
                      )}
                      {r.response_hours !== null && r.status !== 'sent' && <div className="mt-1 text-[11px] text-muted-foreground">Aéreos respondió en {Math.round(Number(r.response_hours))} h</div>}
                      {r.probe_error && <div className="mt-1 text-[11px] text-red-600">{r.probe_error}</div>}
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
      <NewCupoRequestDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  )
}
