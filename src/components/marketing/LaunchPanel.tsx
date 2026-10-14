'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Rocket, Play, RefreshCw, Sparkles, Layers } from 'lucide-react'
import { toast } from 'sonner'
import type { LaunchCandidate } from '@/app/api/marketing/launch/candidates/route'

type Family = { key: string; name: string; configured: boolean; autoLaunch: boolean }

const STATUS: Record<string, { label: string; cls: string }> = {
  launching: { label: 'Lanzando…', cls: 'bg-blue-100 text-blue-700' },
  launched: { label: 'En pausa en Meta', cls: 'bg-amber-100 text-amber-700' },
  active: { label: 'Activo', cls: 'bg-green-100 text-green-700' },
  copy_generated: { label: 'Copys listos', cls: 'bg-purple-100 text-purple-700' },
}

/**
 * Fase 5: paquetes con diseño terminado. "Lanzar en Meta" crea el conjunto
 * desde la plantilla de la familia y los anuncios en pausa; "Activar" los
 * prende. Las dos cosas corren como job en menos de un minuto.
 */
export function LaunchPanel() {
  const [rows, setRows] = useState<LaunchCandidate[]>([])
  const [families, setFamilies] = useState<Family[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/marketing/launch/candidates')
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudieron cargar los lanzamientos'); return }
      setRows(data.candidates ?? []); setFamilies(data.families ?? [])
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!rows.some(r => r.marketingStatus === 'launching' || r.lastJob?.status === 'queued' || r.lastJob?.status === 'running')) return
    const t = setInterval(load, 15_000); return () => clearInterval(t)
  }, [rows, load])

  const run = async (c: LaunchCandidate, action: 'launch' | 'activate') => {
    if (action === 'activate' && !window.confirm(`¿Activar el conjunto de ${c.tcPackageId} en Meta? A partir de ahí empieza a gastar.`)) return
    setBusy(c.id)
    try {
      const res = await fetch('/api/marketing/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: c.id, action }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo encolar'); return }
      toast.success(action === 'launch' ? `${c.tcPackageId}: lanzamiento en cola (menos de un minuto)` : `${c.tcPackageId}: activación en cola`)
      setTimeout(load, 5_000)
    } catch { toast.error('Error de conexión') } finally { setBusy(null) }
  }

  const genCopies = async (c: LaunchCandidate) => {
    setBusy(c.id)
    try {
      const res = await fetch('/api/marketing/copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId: c.id }) })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudieron generar los copys'); return }
      toast.success(`${data.saved?.length ?? 0} copys con voz de marca${data.rejected?.length ? ` (${data.rejected.length} rechazados por QA)` : ''}`)
      await load()
    } catch { toast.error('Error de conexión') } finally { setBusy(null) }
  }

  const setFamily = async (c: LaunchCandidate, key: string) => {
    const res = await fetch(`/api/packages/${c.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ marketing_family: key || null }) })
    if (!res.ok) { toast.error('No se pudo cambiar la familia'); return }
    await load()
  }

  if (loading) return null
  if (rows.length === 0) return null

  return (
    <div className="bg-white border rounded-lg">
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Rocket className="h-5 w-5 text-blue-600" />
        <h2 className="font-semibold">Lanzar en Meta</h2>
        <span className="text-sm text-muted-foreground">{rows.length} paquete{rows.length === 1 ? '' : 's'} con diseño listo</span>
        <span className="flex-1" />
        <Link href="/packages/marketing/familias" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Layers className="h-3.5 w-3.5" />Familias</Link>
        <Button size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Button>
      </div>
      <div className="divide-y">
        {rows.map(c => {
          const st = c.marketingStatus ? STATUS[c.marketingStatus] : null
          const jobRunning = c.lastJob && (c.lastJob.status === 'queued' || c.lastJob.status === 'running')
          const canLaunch = c.familyConfigured && c.creativesCount + 1 > 0 && !jobRunning
          return (
            <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="flex-1 min-w-[260px]">
                <div className="flex items-center gap-2">
                  <Link href={`/packages?q=${c.tcPackageId}`} className="font-mono text-xs text-muted-foreground hover:underline">{c.tcPackageId}</Link>
                  <span className="font-medium">{c.title}</span>
                  {st && <Badge className={`${st.cls} text-[10px]`}>{st.label}</Badge>}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground flex flex-wrap gap-x-3">
                  <span>{c.creativesCount} creativo{c.creativesCount === 1 ? '' : 's'} en Meta</span>
                  <span>{c.copiesCount} copy{c.copiesCount === 1 ? '' : 's'}</span>
                  {c.adsCount > 0 && <span>{c.adsCount} anuncio{c.adsCount === 1 ? '' : 's'}</span>}
                  {c.lastJob && !jobRunning && c.lastJob.status === 'failed' && <span className="text-red-600">Último intento falló: {c.lastJob.error}</span>}
                  {jobRunning && <span className="text-blue-600 inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />en cola</span>}
                  {c.launchError && !jobRunning && <span className="text-red-600">{c.launchError}</span>}
                </div>
              </div>
              <select value={c.familyOverride ?? c.familyKey ?? ''} onChange={e => setFamily(c, e.target.value)} className="h-8 rounded border px-2 text-xs" title="Familia: define campaña y conjunto plantilla">
                <option value="">Familia…</option>
                {families.map(f => <option key={f.key} value={f.key}>{f.name}{f.configured ? '' : ' (sin campaña)'}</option>)}
              </select>
              {c.copiesCount === 0 && <Button size="sm" variant="outline" onClick={() => genCopies(c)} disabled={busy === c.id}><Sparkles className="h-3.5 w-3.5 mr-1" />Copys</Button>}
              {c.marketingStatus === 'launched' && c.adsetId ? (
                <Button size="sm" onClick={() => run(c, 'activate')} disabled={busy === c.id || Boolean(jobRunning)}><Play className="h-3.5 w-3.5 mr-1" />Activar</Button>
              ) : (
                <Button size="sm" onClick={() => run(c, 'launch')} disabled={busy === c.id || !canLaunch} title={!c.familyConfigured ? 'La familia no tiene campaña y conjunto plantilla cargados' : 'Crea el conjunto y los anuncios en pausa'}><Rocket className="h-3.5 w-3.5 mr-1" />Lanzar en Meta</Button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
