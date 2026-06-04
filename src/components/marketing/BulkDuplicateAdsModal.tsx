'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CheckCircle2, Loader2, Copy, Plus, Trash2, X } from 'lucide-react'

interface BulkPackage {
  id: number
  title: string
  tc_package_id: number
}

interface PackageVariants {
  available: number[]
  selected: Set<number>
  loading: boolean
}

interface TargetSlot {
  id: string
  adset_id: string
  campaign_id: string
  validating: boolean
  adset_name?: string
  campaign_name?: string
  error?: string
}

interface ProgressItem {
  package_id: number
  package_title: string
  adset_id: string
  variant?: number
  ok: boolean
  new_ad_id?: string
  error?: string
}

interface BulkDuplicateAdsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packages: BulkPackage[]
  onSuccess?: () => void
}

function newSlot(): TargetSlot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    adset_id: '',
    campaign_id: '',
    validating: false,
  }
}

export function BulkDuplicateAdsModal({
  open,
  onOpenChange,
  packages,
  onSuccess,
}: BulkDuplicateAdsModalProps) {
  const [pkgVariants, setPkgVariants] = useState<Record<number, PackageVariants>>({})
  const [targets, setTargets] = useState<TargetSlot[]>([newSlot()])
  const [statusInitial, setStatusInitial] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE')
  const [step, setStep] = useState<'form' | 'progress' | 'done'>('form')
  const [progress, setProgress] = useState<ProgressItem[]>([])
  const [stats, setStats] = useState<{ total: number; done: number; success: number; failed: number } | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Cargar creativos disponibles por paquete
  useEffect(() => {
    if (!open || packages.length === 0) return
    setStep('form')
    setTargets([newSlot()])
    setProgress([])
    setStats(null)
    setGlobalError(null)

    const initial: Record<number, PackageVariants> = {}
    for (const p of packages) initial[p.id] = { available: [], selected: new Set(), loading: true }
    setPkgVariants(initial)

    Promise.all(
      packages.map(async (p) => {
        try {
          const r = await fetch(`/api/meta/creatives?package_id=${p.id}`)
          if (!r.ok) return { id: p.id, variants: [] }
          const data = await r.json()
          const uploaded = (data.uploaded_creatives || []) as Array<{ variant: number; upload_status?: string }>
          const drive = (data.drive_creatives || []) as Array<{ variant: number }>
          const variantSet = new Set<number>()
          for (const c of uploaded) if (c.upload_status === 'uploaded') variantSet.add(c.variant)
          for (const c of drive) variantSet.add(c.variant)
          return { id: p.id, variants: Array.from(variantSet).sort((a, b) => a - b) }
        } catch {
          return { id: p.id, variants: [] }
        }
      })
    ).then((results) => {
      const next: Record<number, PackageVariants> = {}
      for (const r of results) {
        next[r.id] = {
          available: r.variants,
          selected: new Set(r.variants),
          loading: false,
        }
      }
      setPkgVariants(next)
    })
  }, [open, packages])

  function togglePkgVariant(pkgId: number, v: number) {
    setPkgVariants((prev) => {
      const cur = prev[pkgId]
      if (!cur) return prev
      const sel = new Set(cur.selected)
      if (sel.has(v)) sel.delete(v)
      else sel.add(v)
      return { ...prev, [pkgId]: { ...cur, selected: sel } }
    })
  }
  function setPkgAllVariants(pkgId: number, all: boolean) {
    setPkgVariants((prev) => {
      const cur = prev[pkgId]
      if (!cur) return prev
      return { ...prev, [pkgId]: { ...cur, selected: new Set(all ? cur.available : []) } }
    })
  }

  function updateTarget(id: string, patch: Partial<TargetSlot>) {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }
  function addTarget() { setTargets((prev) => [...prev, newSlot()]) }
  function removeTarget(id: string) {
    setTargets((prev) => (prev.length > 1 ? prev.filter((t) => t.id !== id) : prev))
  }

  async function validateSlot(slot: TargetSlot) {
    const adsetId = slot.adset_id.trim()
    if (!adsetId) return
    updateTarget(slot.id, { validating: true, error: undefined, adset_name: undefined, campaign_name: undefined })
    try {
      const r = await fetch(`/api/meta/validate-target?adset_id=${encodeURIComponent(adsetId)}`)
      const data = await r.json()
      if (!r.ok) {
        updateTarget(slot.id, { validating: false, error: data.error || `HTTP ${r.status}` })
        return
      }
      updateTarget(slot.id, {
        validating: false,
        campaign_id: data.campaign_id,
        campaign_name: data.campaign_name,
        adset_name: data.adset_name,
        error: data.warning || undefined,
      })
    } catch (e) {
      updateTarget(slot.id, { validating: false, error: (e as Error).message })
    }
  }

  // Auto-validate debounced
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const t of targets) {
      const a = t.adset_id.trim()
      if (!a || t.validating) continue
      if ((t.adset_name && !t.error) || t.error) continue
      timers.push(setTimeout(() => validateSlot(t), 400))
    }
    return () => { timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((t) => `${t.id}:${t.adset_id}`).join('|')])

  const validTargets = targets.filter((t) => t.adset_id.trim() && !t.error && t.adset_name && t.campaign_id)
  const totalAdsToCreate = packages.reduce((acc, p) => {
    const v = pkgVariants[p.id]
    if (!v) return acc
    return acc + v.selected.size * validTargets.length
  }, 0)

  async function handleSubmit() {
    setStep('progress')
    setProgress([])
    setStats({ total: totalAdsToCreate, done: 0, success: 0, failed: 0 })

    let stepCount = 0
    let successCount = 0
    let failedCount = 0
    const pushStat = () => setStats({ total: totalAdsToCreate, done: stepCount, success: successCount, failed: failedCount })

    for (const pkg of packages) {
      const v = pkgVariants[pkg.id]
      if (!v || v.selected.size === 0) continue
      const variants = Array.from(v.selected).sort((a, b) => a - b)

      for (const t of validTargets) {
        const adsetId = t.adset_id.trim()
        try {
          const resp = await fetch('/api/meta/ads', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              packages: [{ package_id: pkg.id, meta_adset_id: adsetId, variants }],
              campaign_id: t.campaign_id,
            }),
          })
          if (!resp.ok || !resp.body) {
            failedCount += variants.length
            stepCount += variants.length
            setProgress((p) => [...p, { package_id: pkg.id, package_title: pkg.title, adset_id: adsetId, ok: false, error: `HTTP ${resp.status}` }])
            pushStat()
            continue
          }
          const reader = resp.body.getReader()
          const decoder = new TextDecoder()
          let buf = ''
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            buf += decoder.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const ev = JSON.parse(line.slice(6))
                if (ev.type === 'created') {
                  stepCount++
                  successCount++
                  setProgress((p) => [...p, {
                    package_id: pkg.id, package_title: pkg.title, adset_id: adsetId,
                    variant: ev.data?.variant, ok: true, new_ad_id: ev.data?.meta_ad_id,
                  }])
                } else if (ev.type === 'error') {
                  stepCount++
                  failedCount++
                  setProgress((p) => [...p, {
                    package_id: pkg.id, package_title: pkg.title, adset_id: adsetId,
                    ok: false, error: ev.data?.error || 'Error',
                  }])
                }
                pushStat()
              } catch { /* skip */ }
            }
          }
        } catch (e) {
          failedCount += variants.length
          stepCount += variants.length
          setProgress((p) => [...p, { package_id: pkg.id, package_title: pkg.title, adset_id: adsetId, ok: false, error: (e as Error).message }])
          pushStat()
        }
      }
    }
    setStep('done')
    setStats({ total: totalAdsToCreate, done: stepCount, success: successCount, failed: failedCount })
    if (onSuccess) onSuccess()
  }

  function handleClose() {
    if (step === 'progress') {
      if (!confirm('La replicación está en curso. ¿Cerrar?')) return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Replicar masivo · {packages.length} paquete{packages.length !== 1 ? 's' : ''}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Para cada paquete elegí qué variantes querés crear y pegá abajo los adsets destino.
          </p>
        </DialogHeader>

        {globalError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <strong>Error:</strong> {globalError}
          </div>
        )}

        {step === 'form' && (
          <div className="flex-1 overflow-auto space-y-5 pr-1">
            {/* Paquetes con variantes */}
            <section>
              <Label className="text-sm font-semibold mb-2 block">📦 Paquetes y variantes</Label>
              <div className="space-y-2 max-h-[40vh] overflow-auto border rounded p-2">
                {packages.map((p) => {
                  const v = pkgVariants[p.id]
                  return (
                    <div key={p.id} className="border rounded p-2.5 bg-muted/30">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate" title={p.title}>{p.title}</div>
                          <div className="text-[10px] text-muted-foreground">ID {p.tc_package_id}</div>
                        </div>
                        {v && v.available.length > 0 && (
                          <div className="flex items-center gap-1.5 text-[10px] shrink-0">
                            <button type="button" className="text-blue-600 hover:underline" onClick={() => setPkgAllVariants(p.id, true)}>todas</button>
                            <span className="text-muted-foreground">·</span>
                            <button type="button" className="text-blue-600 hover:underline" onClick={() => setPkgAllVariants(p.id, false)}>ninguna</button>
                          </div>
                        )}
                      </div>
                      {!v || v.loading ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" /> Cargando creativos...
                        </div>
                      ) : v.available.length === 0 ? (
                        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                          Sin creativos cargados — no se va a crear nada
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {v.available.map((variant) => {
                            const sel = v.selected.has(variant)
                            return (
                              <label
                                key={variant}
                                className={`flex items-center gap-1.5 px-2 py-1 rounded border cursor-pointer text-xs ${
                                  sel ? 'bg-blue-50 border-blue-300' : 'hover:bg-muted'
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={sel}
                                  onChange={() => togglePkgVariant(p.id, variant)}
                                  className="h-3.5 w-3.5 accent-blue-600"
                                />
                                <span className="font-medium">V{variant}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </section>

            {/* Destinos */}
            <section>
              <Label className="text-sm font-semibold mb-2 block">🎯 Adsets destino</Label>
              <div className="space-y-2">
                {targets.map((t, idx) => (
                  <div key={t.id} className="border rounded p-2.5 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Destino #{idx + 1}</span>
                      {targets.length > 1 && (
                        <button onClick={() => removeTarget(t.id)} className="text-red-500 hover:text-red-700" title="Quitar">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    <div>
                      <Label className="text-xs text-muted-foreground">Ad Set ID</Label>
                      <Input
                        placeholder="Pegá el ID del ad set (120239...)"
                        value={t.adset_id}
                        onChange={(e) => updateTarget(t.id, {
                          adset_id: e.target.value,
                          campaign_id: '',
                          error: undefined,
                          adset_name: undefined,
                          campaign_name: undefined,
                        })}
                        className="h-8 text-sm font-mono"
                      />
                    </div>
                    {t.validating && (
                      <div className="flex items-center gap-2 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> Validando...
                      </div>
                    )}
                    {!t.validating && t.error && (
                      <div className="flex items-center gap-2 text-xs text-red-600">
                        <X className="h-3 w-3" /> {t.error}
                      </div>
                    )}
                    {!t.validating && !t.error && t.adset_name && (
                      <div className="text-xs space-y-0.5 text-green-800 bg-green-50 border border-green-200 rounded px-2 py-1.5">
                        <div className="flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" /> Validado
                        </div>
                        <div className="break-words">📁 {t.campaign_name}</div>
                        <div className="break-words">🎯 {t.adset_name}</div>
                      </div>
                    )}
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={addTarget} className="w-full">
                  <Plus className="h-4 w-4 mr-2" /> Agregar otro destino
                </Button>
              </div>
            </section>

            {/* Config */}
            <section>
              <Label className="text-xs text-muted-foreground mb-1 block">Estado inicial</Label>
              <div className="inline-flex bg-muted rounded p-0.5 gap-0.5">
                {(['ACTIVE', 'PAUSED'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusInitial(s)}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-colors ${
                      statusInitial === s ? 'bg-white shadow-sm' : 'text-muted-foreground'
                    }`}
                  >
                    {s === 'ACTIVE' ? '▶ ACTIVE' : '⏸ PAUSED'}
                  </button>
                ))}
              </div>
            </section>

            {totalAdsToCreate > 0 && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
                <strong>📊 Vas a crear {totalAdsToCreate} ads</strong>{' '}
                <span className="text-muted-foreground text-xs">
                  · {validTargets.length} destino{validTargets.length !== 1 ? 's' : ''} × variantes por paquete · arrancan {statusInitial}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'progress' && stats && (
          <div className="flex-1 overflow-auto space-y-2 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stats.done} de {stats.total}</span>
              <span className="text-muted-foreground text-xs">✓ {stats.success} · ❌ {stats.failed}</span>
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-auto">
              {progress.map((p, i) => (
                <div key={i} className={`flex items-center gap-2 p-2 rounded text-xs ${p.ok ? 'bg-green-50' : 'bg-red-50'}`}>
                  {p.ok ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" /> : <X className="h-4 w-4 text-red-600 shrink-0" />}
                  <span className="flex-1 break-words">
                    [{p.package_title.slice(0, 40)}] → {p.adset_id}
                    {p.variant ? ` V${p.variant}` : ''}
                    {p.error && <span className="text-red-600 ml-1">— {p.error}</span>}
                  </span>
                  {p.new_ad_id && <span className="text-muted-foreground text-[10px]">{p.new_ad_id.slice(-12)}</span>}
                </div>
              ))}
              {stats.done < stats.total && (
                <div className="flex items-center gap-2 p-2 rounded bg-blue-50 text-xs">
                  <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                  <span>Creando ads...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'done' && stats && (
          <div className="flex-1 flex flex-col items-center justify-center py-8 gap-3">
            <CheckCircle2 className={`h-16 w-16 ${stats.failed === 0 ? 'text-green-600' : 'text-amber-600'}`} />
            <h3 className="text-lg font-bold">
              {stats.failed === 0 ? '¡Listo!' : 'Completado con errores'}
            </h3>
            <p className="text-sm text-muted-foreground">
              {stats.success} ads creados · {stats.failed} fallaron
            </p>
          </div>
        )}

        <div className="flex justify-between items-center pt-4 border-t mt-2">
          <span className="text-xs text-muted-foreground">
            {step === 'form' && validTargets.length > 0 && `${validTargets.length} destino${validTargets.length > 1 ? 's' : ''} validado${validTargets.length > 1 ? 's' : ''}`}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose}>
              {step === 'done' ? 'Cerrar' : 'Cancelar'}
            </Button>
            {step === 'form' && (
              <Button onClick={handleSubmit} disabled={totalAdsToCreate === 0}>
                Crear {totalAdsToCreate > 0 ? totalAdsToCreate : ''} ads →
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
