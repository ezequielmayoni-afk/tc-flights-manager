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
import { CheckCircle2, Loader2, Copy, Plus, Trash2, X, ExternalLink } from 'lucide-react'

interface SourceAd {
  ad_id: string
  name: string
  status: string
  creative_id: string | null
  thumbnail_url: string | null
  adset_id: string
  campaign_name: string
}

interface TargetSlot {
  id: string                    // uuid local para React key
  campaign_id: string
  adset_id: string
  // validación
  validating: boolean
  campaign_name?: string
  adset_name?: string
  campaign_status?: string
  adset_status?: string
  error?: string
}

interface DuplicateAdsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packageId: number
  packageTitle: string
  onSuccess?: () => void
}

function newSlot(): TargetSlot {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    campaign_id: '',
    adset_id: '',
    validating: false,
  }
}

export function DuplicateAdsModal({
  open,
  onOpenChange,
  packageId,
  packageTitle,
  onSuccess,
}: DuplicateAdsModalProps) {
  const [loadingAds, setLoadingAds] = useState(false)
  const [sourceAds, setSourceAds] = useState<SourceAd[]>([])
  const [selectedAdIds, setSelectedAdIds] = useState<Set<string>>(new Set())
  // Para paquetes sin ads aún: nº de creativos disponibles para crear ads desde 0
  const [creativesCount, setCreativesCount] = useState<number>(0)
  const [targets, setTargets] = useState<TargetSlot[]>([newSlot()])
  const [statusInitial, setStatusInitial] = useState<'ACTIVE' | 'PAUSED'>('ACTIVE')
  const [step, setStep] = useState<'form' | 'progress' | 'done'>('form')
  const [progress, setProgress] = useState<Array<{ step: number; total: number; ok: boolean; adset_id: string; source_ad_id: string; new_ad_id?: string; error?: string }>>([])
  const [stats, setStats] = useState<{ total: number; done: number; success: number; failed: number } | null>(null)
  const [globalError, setGlobalError] = useState<string | null>(null)

  // Cargar ads del package
  useEffect(() => {
    if (!open) return
    setLoadingAds(true)
    setGlobalError(null)
    setStep('form')
    setTargets([newSlot()])
    setProgress([])
    setStats(null)
    Promise.all([
      fetch(`/api/packages/${packageId}/meta-ads`).then((r) => r.json()),
      fetch(`/api/meta/creatives?package_id=${packageId}`).then((r) => r.ok ? r.json() : { creatives: [] }),
    ])
      .then(([adsData, creativesData]) => {
        const ads: SourceAd[] = []
        for (const c of adsData.campaigns || []) {
          for (const a of c.adsets || []) {
            for (const ad of a.ads || []) {
              ads.push({
                ad_id: ad.ad_id,
                name: ad.name,
                status: ad.status,
                creative_id: ad.creative_id,
                thumbnail_url: ad.thumbnail_url,
                adset_id: a.adset_id,
                campaign_name: c.campaign_name,
              })
            }
          }
        }
        setSourceAds(ads)
        setSelectedAdIds(new Set(ads.filter((a) => a.status === 'ACTIVE').map((a) => a.ad_id)))
        // Si no hay ads, contar creativos disponibles para "primera carga"
        const uploaded = (creativesData.creatives || []).filter((c: { upload_status?: string }) => c.upload_status === 'uploaded')
        setCreativesCount(uploaded.length || (creativesData.creatives || []).length)
      })
      .catch((e) => setGlobalError(e.message || String(e)))
      .finally(() => setLoadingAds(false))
  }, [open, packageId])

  // Modo "primera carga" cuando no hay ads existentes — usa creatives del paquete
  const isFirstUploadMode = !loadingAds && sourceAds.length === 0 && creativesCount > 0

  function toggleAd(adId: string) {
    setSelectedAdIds((prev) => {
      const n = new Set(prev)
      if (n.has(adId)) n.delete(adId)
      else n.add(adId)
      return n
    })
  }

  function updateTarget(id: string, patch: Partial<TargetSlot>) {
    setTargets((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function addTarget() {
    setTargets((prev) => [...prev, newSlot()])
  }

  function removeTarget(id: string) {
    setTargets((prev) => prev.length > 1 ? prev.filter((t) => t.id !== id) : prev)
  }

  // Validar un slot contra Meta a partir del adset_id (deriva la campaign).
  async function validateSlot(slot: TargetSlot) {
    const adsetId = slot.adset_id.trim()
    if (!adsetId) return

    updateTarget(slot.id, { validating: true, error: undefined, campaign_name: undefined, adset_name: undefined })
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
        campaign_status: data.campaign_status,
        adset_name: data.adset_name,
        adset_status: data.adset_status,
        error: data.warning || undefined,
      })
    } catch (e) {
      updateTarget(slot.id, { validating: false, error: (e as Error).message })
    }
  }

  // Auto-validar cada slot cuando el adset_id está completo (debounced 400ms).
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = []
    for (const t of targets) {
      const a = t.adset_id.trim()
      if (!a) continue
      if (t.validating) continue
      const alreadyValidated = t.adset_name && !t.error
      const errorForCurrentPair = t.error
      if (alreadyValidated || errorForCurrentPair) continue
      timers.push(setTimeout(() => validateSlot(t), 400))
    }
    return () => { timers.forEach(clearTimeout) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.map((t) => `${t.id}:${t.adset_id}`).join('|')])

  const validTargets = targets.filter((t) => t.adset_id.trim() && !t.error && t.adset_name && t.campaign_id)
  const totalAdsToCreate = isFirstUploadMode
    ? creativesCount * validTargets.length
    : selectedAdIds.size * validTargets.length

  async function handleSubmit() {
    setStep('progress')
    setProgress([])
    setStats({ total: totalAdsToCreate, done: 0, success: 0, failed: 0 })

    try {
      // Modo "primera carga": crear ads desde 0 usando creatives del paquete (POST /api/meta/ads)
      if (isFirstUploadMode) {
        let stepCount = 0
        let successCount = 0
        let failedCount = 0
        for (const t of validTargets) {
          const adsetId = t.adset_id.trim()
          try {
            const resp = await fetch('/api/meta/ads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                packages: [{ package_id: packageId, meta_adset_id: adsetId }],
                campaign_id: t.campaign_id,
              }),
            })
            if (!resp.ok || !resp.body) {
              failedCount += creativesCount
              stepCount += creativesCount
              setStats((s) => s ? { ...s, done: stepCount, failed: failedCount } : null)
              setProgress((p) => [...p, { step: stepCount, total: totalAdsToCreate, ok: false, adset_id: adsetId, source_ad_id: '', error: `HTTP ${resp.status}` }])
              continue
            }
            // Stream SSE — el endpoint emite 'created' por ad
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
                    setProgress((p) => [...p, { step: stepCount, total: totalAdsToCreate, ok: true, adset_id: adsetId, source_ad_id: '', new_ad_id: ev.data?.meta_ad_id }])
                  } else if (ev.type === 'error') {
                    stepCount++
                    failedCount++
                    setProgress((p) => [...p, { step: stepCount, total: totalAdsToCreate, ok: false, adset_id: adsetId, source_ad_id: '', error: ev.data?.error || 'Error desconocido' }])
                  }
                  setStats((s) => s ? { ...s, done: stepCount, success: successCount, failed: failedCount } : null)
                } catch { /* skip */ }
              }
            }
          } catch (e) {
            stepCount += creativesCount
            failedCount += creativesCount
            setStats((s) => s ? { ...s, done: stepCount, failed: failedCount } : null)
            setProgress((p) => [...p, { step: stepCount, total: totalAdsToCreate, ok: false, adset_id: adsetId, source_ad_id: '', error: (e as Error).message }])
          }
        }
        setStep('done')
        setStats({ total: totalAdsToCreate, done: stepCount, success: successCount, failed: failedCount })
        if (onSuccess) onSuccess()
        return
      }

      const resp = await fetch('/api/meta/ads/duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          package_id: packageId,
          source_ad_ids: Array.from(selectedAdIds),
          target_adset_ids: validTargets.map((t) => t.adset_id.trim()),
          status: statusInitial,
        }),
      })
      if (!resp.ok || !resp.body) {
        const t = await resp.text()
        throw new Error(`HTTP ${resp.status}: ${t.slice(0, 200)}`)
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
            if (ev.type === 'progress') {
              setProgress((p) => [...p, ev])
              setStats((s) => s ? {
                ...s,
                done: ev.step,
                success: ev.ok ? s.success + 1 : s.success,
                failed: ev.ok ? s.failed : s.failed + 1,
              } : null)
            } else if (ev.type === 'done') {
              setStep('done')
              setStats((s) => s ? { ...s, success: ev.success, failed: ev.failed } : null)
              if (onSuccess) onSuccess()
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setGlobalError((e as Error).message)
    }
  }

  function handleClose() {
    if (step === 'progress') {
      if (!confirm('La replicación está en curso. ¿Cerrar?')) return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-5 w-5" />
            Replicar anuncios
          </DialogTitle>
          <p className="text-sm text-muted-foreground break-words">
            Pegá el ID del conjunto de anuncios destino para <strong>{packageTitle}</strong>. La campaña se detecta automáticamente.
          </p>
        </DialogHeader>

        {globalError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <strong>Error:</strong> {globalError}
          </div>
        )}

        {step === 'form' && (
          <div className="flex-1 overflow-auto space-y-5">

            {/* Ads source */}
            <section>
              <Label className="text-sm font-semibold mb-2 block">
                {isFirstUploadMode ? '🆕 Primera carga' : '📦 Anuncios a replicar'}
                {!isFirstUploadMode && selectedAdIds.size > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground font-normal">
                    ({selectedAdIds.size} seleccionados)
                  </span>
                )}
              </Label>
              {loadingAds ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Cargando ads del paquete...
                </div>
              ) : isFirstUploadMode ? (
                <div className="text-sm p-3 border rounded bg-blue-50 border-blue-200 text-blue-900">
                  Este paquete no tiene ads en Meta todavía. Vamos a crearlos usando los{' '}
                  <strong>{creativesCount} creativo{creativesCount !== 1 ? 's' : ''}</strong> del paquete.
                  Pegá abajo los ad sets destino y se creará 1 ad por creativo en cada uno.
                </div>
              ) : sourceAds.length === 0 ? (
                <div className="text-xs text-muted-foreground p-3 border rounded bg-amber-50">
                  Este paquete no tiene ads ni creativos cargados. Subí creativos primero.
                </div>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-auto border rounded p-2">
                  {sourceAds.map((ad) => (
                    <label
                      key={ad.ad_id}
                      className={`flex items-center gap-2 p-2 rounded cursor-pointer ${
                        selectedAdIds.has(ad.ad_id) ? 'bg-blue-50' : 'hover:bg-muted'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedAdIds.has(ad.ad_id)}
                        onChange={() => toggleAd(ad.ad_id)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      {ad.thumbnail_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={ad.thumbnail_url} alt="" className="w-8 h-8 rounded object-cover" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium break-words leading-snug">{ad.name || ad.ad_id}</div>
                        <div className="text-xs text-muted-foreground break-all">
                          {ad.ad_id} · <span className="break-words">{ad.campaign_name}</span>
                        </div>
                      </div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        ad.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {ad.status}
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </section>

            {/* Destinos */}
            <section>
              <Label className="text-sm font-semibold mb-2 block">
                🎯 Destinos (pegá los IDs de Meta Ads Manager)
              </Label>
              <div className="space-y-2">
                {targets.map((t, idx) => (
                  <div key={t.id} className="border rounded p-3 space-y-2 bg-muted/30">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-muted-foreground">Destino #{idx + 1}</span>
                      {targets.length > 1 && (
                        <button
                          onClick={() => removeTarget(t.id)}
                          className="text-red-500 hover:text-red-700"
                          title="Quitar destino"
                        >
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
                          campaign_name: undefined,
                          adset_name: undefined,
                        })}
                        className="h-8 text-sm font-mono"
                      />
                    </div>

                    {/* Validation feedback */}
                    {t.validating && (
                      <div className="flex items-center gap-2 text-xs text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" /> Validando contra Meta...
                      </div>
                    )}
                    {!t.validating && t.error && (
                      <div className="flex items-center gap-2 text-xs text-red-600">
                        <X className="h-3 w-3" /> {t.error}
                      </div>
                    )}
                    {!t.validating && !t.error && t.adset_name && (
                      <div className="text-xs space-y-1 text-green-800 bg-green-50 border border-green-200 rounded px-2.5 py-2">
                        <div className="flex items-center gap-1 font-semibold">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Validado
                        </div>
                        <div className="break-words">
                          <span className="text-gray-600">📁 Campaña:</span> {t.campaign_name}{' '}
                          <span className="text-gray-500">({t.campaign_status})</span>
                        </div>
                        <div className="break-words">
                          <span className="text-gray-600">🎯 Ad set:</span> {t.adset_name}{' '}
                          <span className="text-gray-500">({t.adset_status})</span>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={addTarget}
                  className="w-full"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar otro destino
                </Button>
              </div>
            </section>

            {/* Config */}
            <section className="grid grid-cols-2 gap-3 items-end">
              <div>
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
              </div>
              <div className="text-right">
                <a
                  href="https://adsmanager.facebook.com/adsmanager/manage/campaigns"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-blue-600 hover:underline inline-flex items-center gap-1"
                >
                  Abrir Ads Manager <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </section>

            {/* Resumen */}
            {totalAdsToCreate > 0 && (
              <div className="rounded-md bg-blue-50 border border-blue-200 p-3 text-sm">
                <strong>📊 Vas a crear {totalAdsToCreate} ads:</strong>{' '}
                <span className="text-muted-foreground text-xs">
                  {isFirstUploadMode
                    ? `${creativesCount} creativo${creativesCount !== 1 ? 's' : ''}`
                    : `${selectedAdIds.size} ads`}
                  {' '}× {validTargets.length} destino{validTargets.length !== 1 ? 's' : ''} · arrancan {statusInitial}
                </span>
              </div>
            )}
          </div>
        )}

        {step === 'progress' && stats && (
          <div className="flex-1 overflow-auto space-y-2 py-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">{stats.done} de {stats.total}</span>
              <span className="text-muted-foreground text-xs">
                ✓ {stats.success} · ❌ {stats.failed}
              </span>
            </div>
            <div className="space-y-1 max-h-[50vh] overflow-auto">
              {progress.map((p, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 p-2 rounded text-xs ${
                    p.ok ? 'bg-green-50' : 'bg-red-50'
                  }`}
                >
                  {p.ok ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" />
                  ) : (
                    <X className="h-4 w-4 text-red-600 shrink-0" />
                  )}
                  <span className="flex-1 break-words">
                    {p.adset_id} → ad {p.source_ad_id.slice(-12)}
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
              <Button
                onClick={handleSubmit}
                disabled={totalAdsToCreate === 0}
              >
                Replicar {totalAdsToCreate > 0 ? totalAdsToCreate : ''} ads →
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
