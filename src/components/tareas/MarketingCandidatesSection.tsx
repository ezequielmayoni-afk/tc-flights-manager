'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { ChevronDown, ChevronRight, ExternalLink, Globe, Loader2, Megaphone, Palette, RefreshCw, Settings2 } from 'lucide-react'
import { toast } from 'sonner'
import { publicPackageUrl } from '@/lib/packages/public-url'
import { TRACK_COLORS } from '@/lib/marketing/labels'
import { ThemesEditor } from '@/components/packages/ThemesEditor'
import type { MarketingCandidate } from '@/app/api/marketing/candidates/route'

type Taxonomy = Array<{ name: string; count: number }>

/**
 * Fase 4: paquetes evaluados por el criterio marketing vs web que todavía no
 * fueron a diseño. "Enviar a diseño" usa la misma acción de siempre (creative
 * request + Slack #design) y deja registrada la decisión.
 */
export function MarketingCandidatesSection() {
  const [candidates, setCandidates] = useState<MarketingCandidate[]>([])
  const [taxonomy, setTaxonomy] = useState<Taxonomy>([])
  const [loading, setLoading] = useState(true)
  const [evaluating, setEvaluating] = useState(false)
  const [busy, setBusy] = useState<number | null>(null)
  const [showWeb, setShowWeb] = useState(false)
  const [open, setOpen] = useState<Set<number>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/candidates')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudieron cargar los candidatos'); return }
      setCandidates(data.candidates ?? [])
      setTaxonomy(data.themeTaxonomy ?? [])
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const groups = useMemo(() => {
    const undecided = candidates.filter(c => !c.decidedBy)
    return {
      marketing: undecided.filter(c => c.track === 'marketing'),
      manual: undecided.filter(c => c.track === 'manual'),
      web: candidates.filter(c => c.track === 'web' || (c.decidedBy && c.track !== 'marketing' && c.track !== 'manual')),
      decidedMarketing: candidates.filter(c => c.decidedBy && (c.track === 'marketing' || c.track === 'manual')),
      pending: candidates.filter(c => c.track === 'undecided').length,
      excluded: candidates.filter(c => c.track === 'excluded').length,
    }
  }, [candidates])

  const evaluateNow = async () => {
    setEvaluating(true)
    try {
      const res = await fetch('/api/marketing/evaluate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo encolar la evaluación'); return }
      toast.info(data.deduped ? 'Ya había una evaluación en cola; en un minuto se actualiza' : 'Evaluación encolada: en un minuto se actualiza')
      setTimeout(load, 45_000)
    } catch { toast.error('Error de conexión') } finally { setEvaluating(false) }
  }

  const decide = async (c: MarketingCandidate, track: 'marketing' | 'web' | 'manual') => {
    setBusy(c.id)
    try {
      if (track === 'marketing') {
        const res = await fetch('/api/packages/bulk-action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageIds: [c.id], action: 'design', reason: 'new_package', priority: c.score !== null && c.score >= 70 ? 'high' : 'normal', reason_detail: `Recomendado por el criterio marketing (score ${c.score ?? '-'}): ${c.reasons.slice(0, 3).join(' · ')}` }) })
        const data = await res.json()
        if (!res.ok) { toast.error(data.error || 'No se pudo enviar a diseño'); return }
      }
      const res = await fetch('/api/marketing/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: c.id, track, note: track === 'marketing' ? 'Enviado a diseño desde Tareas' : undefined }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo registrar la decisión'); return }
      toast.success(track === 'marketing' ? `${c.tcPackageId}: enviado a diseño` : track === 'web' ? `${c.tcPackageId}: queda sólo en la web` : `${c.tcPackageId}: vuelve a "para decidir"`)
      await load()
    } catch { toast.error('Error de conexión') } finally { setBusy(null) }
  }

  const toggle = (id: number) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const row = (c: MarketingCandidate) => {
    const isOpen = open.has(c.id)
    const details = (c.details ?? {}) as { cupo?: { remaining: number; total: number } | null; marginPct?: number | null; daysToDeparture?: number | null; family?: string | null }
    return (
      <div key={c.id} className="border-b last:border-b-0">
        <div className="flex items-start gap-3 px-4 py-3">
          <button type="button" onClick={() => toggle(c.id)} className="mt-0.5 text-muted-foreground" aria-label="Detalle">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={`${TRACK_COLORS[c.track] ?? ''} text-xs`}>{c.score ?? '–'}</Badge>
              <Link href={`/packages?q=${c.tcPackageId}`} className="font-mono text-xs text-muted-foreground hover:underline">{c.tcPackageId}</Link>
              <span className="font-medium truncate">{c.title}</span>
              <a href={publicPackageUrl(c.tcPackageId, c.title)} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-foreground" title="Ver en siviajo.com"><ExternalLink className="h-3.5 w-3.5" /></a>
              {c.decidedBy && <span className="text-[11px] text-muted-foreground">decidido por {c.decidedBy}</span>}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3">
              {c.destinations.length > 0 && <span>{c.destinations.join(' · ')}</span>}
              {c.departureDate && <span>Sale {new Date(c.departureDate + 'T12:00:00Z').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })}{details.daysToDeparture !== null && details.daysToDeparture !== undefined ? ` (${details.daysToDeparture} días)` : ''}</span>}
              {c.pricePerPax !== null && <span>USD {Math.round(c.pricePerPax).toLocaleString('es-AR')} pp</span>}
              {details.cupo && details.cupo.total > 0 && <span>Cupo {details.cupo.remaining}/{details.cupo.total}</span>}
              {details.marginPct !== null && details.marginPct !== undefined && <span>Margen {details.marginPct}%</span>}
            </div>
            <p className="mt-1 text-xs">{c.reasons.slice(0, isOpen ? undefined : 3).join(' · ')}{!isOpen && c.reasons.length > 3 ? ' …' : ''}</p>
            {isOpen && (
              <div className="mt-3 space-y-3">
                <ThemesEditor packageId={c.id} tcThemes={c.themes} localThemes={c.themesLocal} taxonomy={taxonomy} pushedAt={c.themesPushedAt} onSaved={themes => setCandidates(prev => prev.map(x => x.id === c.id ? { ...x, themesLocal: themes } : x))} />
                {c.details && <details className="text-[11px] text-muted-foreground"><summary className="cursor-pointer">Componentes del score</summary><pre className="mt-1 whitespace-pre-wrap">{JSON.stringify((c.details as { components?: unknown }).components ?? c.details, null, 1)}</pre></details>}
              </div>
            )}
          </div>
          <div className="flex flex-col sm:flex-row gap-1.5 shrink-0">
            {c.track !== 'excluded' && (
              <Button size="sm" onClick={() => decide(c, 'marketing')} disabled={busy === c.id} title="Crea el pedido a diseño y avisa en Slack, como siempre">{busy === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><Palette className="h-3.5 w-3.5 mr-1" />Enviar a diseño</>}</Button>
            )}
            {c.track !== 'web' && c.track !== 'excluded' && (
              <Button size="sm" variant="outline" onClick={() => decide(c, 'web')} disabled={busy === c.id}><Globe className="h-3.5 w-3.5 mr-1" />Sólo web</Button>
            )}
            {c.track === 'web' && c.decidedBy && (
              <Button size="sm" variant="ghost" onClick={() => decide(c, 'manual')} disabled={busy === c.id}>Volver a decidir</Button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const block = (title: string, icon: React.ReactNode, items: MarketingCandidate[], empty: string) => (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center gap-2 px-4 py-2 border-b bg-muted/40 text-sm font-medium">{icon}{title}<span className="text-muted-foreground font-normal">{items.length}</span></div>
        {items.length === 0 ? <p className="text-sm text-muted-foreground text-center py-6">{empty}</p> : items.map(row)}
      </CardContent>
    </Card>
  )

  if (loading) return <div className="flex items-center gap-2 text-sm text-muted-foreground py-6"><Loader2 className="h-4 w-4 animate-spin" />Cargando candidatos…</div>

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{candidates.length} paquetes activos sin decisión de marketing</span>
        {groups.pending > 0 && <span>· {groups.pending} sin evaluar todavía</span>}
        {groups.excluded > 0 && <span>· {groups.excluded} excluidos (sin precio, vencidos o en cotización manual)</span>}
        <span className="flex-1" />
        <Button size="sm" variant="outline" onClick={evaluateNow} disabled={evaluating}>{evaluating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <><RefreshCw className="h-3.5 w-3.5 mr-1" />Evaluar ahora</>}</Button>
        <Link href="/packages/marketing/reglas" className="inline-flex items-center gap-1 px-3 py-1.5 border rounded-md hover:bg-muted text-foreground"><Settings2 className="h-3.5 w-3.5" />Reglas</Link>
      </div>
      {block('Recomendados para marketing', <Megaphone className="h-4 w-4 text-green-600" />, groups.marketing, 'Nada nuevo para pautar por ahora')}
      {block('Para decidir', <Megaphone className="h-4 w-4 text-amber-600" />, groups.manual, 'No hay paquetes en zona gris')}
      {groups.decidedMarketing.length > 0 && block('Decididos, esperando diseño', <Palette className="h-4 w-4 text-purple-600" />, groups.decidedMarketing, '')}
      <button type="button" onClick={() => setShowWeb(v => !v)} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">{showWeb ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}Sólo web ({groups.web.length})</button>
      {showWeb && block('Sólo web (variedad del catálogo)', <Globe className="h-4 w-4 text-slate-500" />, groups.web, 'Ninguno')}
    </div>
  )
}
