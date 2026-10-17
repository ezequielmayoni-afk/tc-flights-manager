'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Loader2, CalendarSearch } from 'lucide-react'
import { toast } from 'sonner'
import type { AlternativeView } from '@/lib/requote/alternative-view'

const money = (v: number | null) => (v === null ? '?' : `USD ${Math.round(v).toLocaleString('es-AR')}`)
const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: '2-digit' })

/**
 * Fecha alternativa de un paquete (Fase 10): la propone el cotizador dentro de
 * la misma temporada; una persona aprueba, ensaya y aplica. Vale para cupos
 * agotados y para paquetes de sistema que subieron de precio.
 */
export function AlternativeDatePanel({ packageId, initial, trigger = 'manual', compact = false }: { packageId: number; initial?: AlternativeView | null; trigger?: string; compact?: boolean }) {
  const [alt, setAlt] = useState<AlternativeView | null | undefined>(initial)
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/requote/alternatives?packageId=${packageId}`)
    if (res.ok) { const d = await res.json(); setAlt(d.alternative ?? null); setSearching(Boolean(d.searching)) }
  }, [packageId])
  useEffect(() => { if (initial === undefined) load() }, [initial, load])
  useEffect(() => {
    if (!searching && alt?.status !== 'applying') return
    const t = setInterval(load, 20_000); return () => clearInterval(t)
  }, [searching, alt?.status, load])

  const search = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/requote/alternatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId, trigger }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No se pudo encolar la búsqueda'); return }
      toast.info('Buscando fecha en la temporada: el cotizador tarda unos minutos')
      setSearching(true)
    } finally { setBusy(false) }
  }
  const decide = async (action: 'approve' | 'reject' | 'prepare' | 'apply') => {
    if (!alt) return
    if (action === 'apply' && !window.confirm('¿Aplicar la fecha en siviajo.com? El bot cambia las fechas de la idea y la recotiza con el aéreo propuesto.')) return
    setBusy(true)
    try {
      const res = await fetch(`/api/requote/alternatives/${alt.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No se pudo'); return }
      toast.success(action === 'approve' ? 'Fecha aprobada' : action === 'reject' ? 'Propuesta rechazada' : action === 'prepare' ? 'Ensayo en cola' : 'Aplicación en cola')
      await load()
    } finally { setBusy(false) }
  }

  if (alt === undefined) return <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />fecha alternativa…</span>
  if (searching && (!alt || alt.status === 'failed' || alt.status === 'rejected')) return <span className="text-xs text-blue-700 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Buscando fecha en la temporada…</span>
  if (!alt || alt.status === 'failed' || alt.status === 'rejected' || alt.status === 'superseded') {
    return (
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{alt?.status === 'failed' ? `Sin fecha alternativa: ${alt.reason ?? 'el cotizador no devolvió precio'}` : alt?.status === 'rejected' ? 'Propuesta rechazada.' : 'Sin fecha alternativa buscada.'}</span>
        <Button size="sm" variant="outline" className="h-7" onClick={search} disabled={busy}><CalendarSearch className="h-3.5 w-3.5 mr-1" />Buscar fecha en la temporada</Button>
      </div>
    )
  }
  return (
    <div className={`text-xs ${compact ? '' : 'bg-blue-50/50 border border-blue-100 rounded-md p-2'} space-y-1`}>
      <div>
        <span className="font-medium">Fecha alternativa ({alt.seasonKind === 'alta' ? 'temporada alta' : alt.seasonKind === 'baja' ? 'temporada baja' : 'misma temporada'}):</span>{' '}
        sale {alt.proposedDeparture ? fmt(alt.proposedDeparture) : '?'}{alt.proposedReturn ? ` → ${fmt(alt.proposedReturn)}` : ''} · {alt.airline ?? 'aéreo ?'} {alt.flightNumbers.join('/')} {alt.direct === true ? 'directo' : alt.direct === false ? 'con escala' : ''} · <span className="font-medium">{money(alt.pricePp)} pp</span>
        {alt.variancePct !== null && <span className={alt.variancePct > 0 ? 'text-red-600' : 'text-emerald-700'}> ({alt.variancePct > 0 ? '+' : ''}{alt.variancePct}% vs {money(alt.currentPricePp)})</span>}
        {alt.hotelMatched === false && <span className="text-amber-700"> · el hotel del paquete no apareció en esa fecha</span>}
      </div>
      {alt.note && <div className="text-muted-foreground">{alt.note}</div>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-muted-foreground">{alt.status === 'proposed' ? 'Propuesta' : alt.status === 'approved' ? 'Aprobada: ensayala o aplicala en siviajo.com' : alt.status === 'applying' ? 'El bot está trabajando en siviajo.com…' : alt.status === 'applied' ? 'Aplicada en siviajo.com' : alt.status}</span>
        {alt.status === 'proposed' && <><Button size="sm" className="h-7" disabled={busy} onClick={() => decide('approve')}>Aprobar fecha</Button><Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => decide('reject')}>Rechazar</Button></>}
        {alt.status === 'approved' && <><Button size="sm" variant="outline" className="h-7" disabled={busy} onClick={() => decide('prepare')} title="Hace todo en siviajo.com menos guardar">Ensayar</Button><Button size="sm" className="h-7" disabled={busy} onClick={() => decide('apply')}>Aplicar en siviajo.com</Button><Button size="sm" variant="ghost" className="h-7" disabled={busy} onClick={() => decide('reject')}>Rechazar</Button></>}
        {(alt.status === 'proposed' || alt.status === 'approved') && <Button size="sm" variant="ghost" className="h-7 text-muted-foreground" disabled={busy} onClick={search} title="Vuelve a sondear la temporada">Buscar de nuevo</Button>}
      </div>
    </div>
  )
}
