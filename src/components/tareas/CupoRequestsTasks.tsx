'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, AlertTriangle, Clock } from 'lucide-react'
import { REQUEST_STATUS_LABELS, type CupoRequest } from '@/lib/cupos/requests'

type Row = CupoRequest & { summary: { total: number; quoted: number; accepted: number }; waitingHours: number | null; overdue: boolean }

/** Tareas: pedidos a aéreos que esperan algo de alguien (respuesta, decisión o carga). */
export function CupoRequestsTasks() {
  const [rows, setRows] = useState<Row[] | null>(null)
  useEffect(() => { fetch('/api/cupos/requests').then(r => r.json()).then(d => setRows((d.requests ?? []).filter((r: Row) => ['sent', 'answered', 'confirming', 'confirmed'].includes(r.status)))).catch(() => setRows([])) }, [])
  if (rows === null) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="h-4 w-4 animate-spin" />Cargando…</div>
  if (rows.length === 0) return <p className="text-sm text-muted-foreground text-center py-6 bg-white rounded-lg border">No hay pedidos a aéreos esperando</p>
  const what = (r: Row) => r.status === 'sent' ? (r.overdue ? 'Aéreos no respondió en el plazo' : 'Esperando respuesta de aéreos') : r.status === 'confirmed' ? `Cargar ${r.summary.accepted} cupo(s) en Vuelos` : `${r.summary.quoted} tirada(s) con precio: aceptar o rechazar y confirmar`
  return (
    <div className="bg-white rounded-lg border divide-y">
      {rows.map(r => (
        <Link key={r.id} href={`/flights/pedidos/${r.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 hover:bg-muted/30">
          {r.overdue ? <AlertTriangle className="h-4 w-4 text-red-600" /> : r.status === 'sent' ? <Clock className="h-4 w-4 text-amber-600" /> : <Send className="h-4 w-4 text-blue-600" />}
          <div className="flex-1 min-w-[240px]"><div className="font-medium text-sm">#{r.id} · {r.title}</div><div className="text-xs text-muted-foreground">{what(r)}</div></div>
          <Badge variant="secondary" className="text-[10px]">{REQUEST_STATUS_LABELS[r.status]}</Badge>
          {r.waitingHours !== null && r.status === 'sent' && <span className={`text-xs ${r.overdue ? 'text-red-600' : 'text-muted-foreground'}`}>{Math.round(r.waitingHours)} h</span>}
        </Link>
      ))}
    </div>
  )
}
