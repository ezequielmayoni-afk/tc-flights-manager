'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { toast } from 'sonner'
import { Loader2, Check, AlertCircle, ChevronRight, ChevronLeft } from 'lucide-react'

interface Package {
  id: number
  tc_package_id: number
  title: string
}

interface Campaign {
  meta_campaign_id: string
  name: string
  status: string
  meta_adsets: AdSet[]
}

interface AdSet {
  meta_adset_id: string
  name: string
  status: string
}

interface CopyVariant {
  id: number
  variant: number
  headline: string
  primary_text: string
  description: string
  wa_message_template: string
}

interface ExistingAd {
  id: number
  variant: number
  meta_ad_id: string
  meta_adset_id: string
  ad_name: string
  status: string
  published_at: string
}

interface AdCreationModalProps {
  package: Package
  open: boolean
  onClose: () => void
}

type Step = 'select' | 'review' | 'creating' | 'complete'

export function AdCreationModal({ package: pkg, open, onClose }: AdCreationModalProps) {
  const [step, setStep] = useState<Step>('select')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [selectedCampaign, setSelectedCampaign] = useState<string>('')
  const [selectedAdSet, setSelectedAdSet] = useState<string>('')
  const [copies, setCopies] = useState<CopyVariant[]>([])
  const [existingAds, setExistingAds] = useState<ExistingAd[]>([])
  const [selectedVariants, setSelectedVariants] = useState<Set<number>>(new Set([1, 2, 3, 4, 5]))
  const [isLoading, setIsLoading] = useState(false)
  const [creationProgress, setCreationProgress] = useState<string[]>([])
  const [creationResult, setCreationResult] = useState<{ created: number; errors: number } | null>(null)

  // Load campaigns and copies on mount
  useEffect(() => {
    if (open) {
      loadData()
    }
  }, [open])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Load campaigns
      const campaignsRes = await fetch('/api/meta/campaigns')
      const campaignsData = await campaignsRes.json()
      setCampaigns(campaignsData.campaigns || [])

      // Load copies for this package
      const copiesRes = await fetch(`/api/meta/copy/${pkg.id}`)
      if (copiesRes.ok) {
        const copiesData = await copiesRes.json()
        setCopies(copiesData.copies || [])
      }

      // Load existing ads for this package
      const adsRes = await fetch(`/api/meta/ads?package_id=${pkg.id}`)
      if (adsRes.ok) {
        const adsData = await adsRes.json()
        setExistingAds(adsData.ads || [])
      }
    } catch (error) {
      toast.error('Error cargando datos')
    } finally {
      setIsLoading(false)
    }
  }

  const selectedCampaignData = campaigns.find((c) => c.meta_campaign_id === selectedCampaign)
  const adSets = selectedCampaignData?.meta_adsets || []

  const toggleVariant = (variant: number) => {
    setSelectedVariants((prev) => {
      const next = new Set(prev)
      if (next.has(variant)) {
        next.delete(variant)
      } else {
        next.add(variant)
      }
      return next
    })
  }

  const handleNext = () => {
    if (step === 'select') {
      if (!selectedAdSet) {
        toast.error('Selecciona un conjunto de anuncios')
        return
      }
      setStep('review')
    } else if (step === 'review') {
      if (selectedVariants.size === 0) {
        toast.error('Selecciona al menos una variante')
        return
      }
      handleCreateAds()
    }
  }

  const handleBack = () => {
    if (step === 'review') {
      setStep('select')
    }
  }

  const handleCreateAds = async () => {
    setStep('creating')
    setCreationProgress([])

    try {
      const response = await fetch('/api/meta/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packages: [
            {
              package_id: pkg.id,
              meta_adset_id: selectedAdSet,
              variants: Array.from(selectedVariants),
            },
          ],
        }),
      })

      if (!response.ok) {
        throw new Error('Error creando anuncios')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      if (!reader) throw new Error('No response body')

      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter((l) => l.startsWith('data: '))

        for (const line of lines) {
          const data = JSON.parse(line.slice(6))

          if (data.type === 'creating') {
            setCreationProgress((prev) => [
              ...prev,
              `Variante ${data.data.variant}: ${data.data.step}`,
            ])
          } else if (data.type === 'created') {
            setCreationProgress((prev) => [
              ...prev,
              `Variante ${data.data.variant}: Creado (${data.data.meta_ad_id})`,
            ])
          } else if (data.type === 'error') {
            setCreationProgress((prev) => [
              ...prev,
              `Error V${data.data.variant}: ${data.data.error}`,
            ])
          } else if (data.type === 'complete') {
            setCreationResult(data.data)
            setStep('complete')
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error creando anuncios')
      setStep('review')
    }
  }

  const renderStepSelect = () => (
    <div className="space-y-6">
      <div className="space-y-2">
        <label className="text-sm font-medium">Campaña</label>
        <Select value={selectedCampaign} onValueChange={setSelectedCampaign}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona una campaña" />
          </SelectTrigger>
          <SelectContent>
            {campaigns.map((campaign) => (
              <SelectItem key={campaign.meta_campaign_id} value={campaign.meta_campaign_id}>
                {campaign.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selectedCampaign && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Conjunto de Anuncios</label>
          <Select value={selectedAdSet} onValueChange={setSelectedAdSet}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona un ad set" />
            </SelectTrigger>
            <SelectContent>
              {adSets.map((adset) => (
                <SelectItem key={adset.meta_adset_id} value={adset.meta_adset_id}>
                  {adset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {adSets.length === 0 && selectedCampaign && (
        <p className="text-sm text-muted-foreground">
          No hay ad sets activos en esta campaña
        </p>
      )}
    </div>
  )

  const renderStepReview = () => (
    <div className="space-y-6">
      <div className="bg-muted p-4 rounded-lg">
        <p className="text-sm">
          <strong>Campaña:</strong> {selectedCampaignData?.name}
        </p>
        <p className="text-sm">
          <strong>Ad Set:</strong> {adSets.find((a) => a.meta_adset_id === selectedAdSet)?.name}
        </p>
        <p className="text-sm">
          <strong>Nombre del anuncio:</strong> {pkg.title} - {pkg.tc_package_id}
        </p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Variantes a crear</label>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((variant) => {
            const copy = copies.find((c) => c.variant === variant)
            const existingAd = existingAds.find((a) => a.variant === variant)
            return (
              <div
                key={variant}
                className="flex items-start gap-3 p-3 border rounded-lg"
              >
                <Checkbox
                  checked={selectedVariants.has(variant)}
                  onCheckedChange={() => toggleVariant(variant)}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">V{variant}</Badge>
                    {copy ? (
                      <span className="text-sm font-medium">{copy.headline}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Sin copy</span>
                    )}
                  </div>
                  {copy && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {copy.primary_text}
                    </p>
                  )}
                  {existingAd && (
                    <div className="mt-2 text-xs">
                      <span className="font-mono bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                        ID: {existingAd.meta_ad_id}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  const renderStepCreating = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
      <div className="space-y-1 max-h-[200px] overflow-auto">
        {creationProgress.map((progress, i) => (
          <p key={i} className="text-sm text-muted-foreground">
            {progress}
          </p>
        ))}
      </div>
    </div>
  )

  const renderStepComplete = () => (
    <div className="space-y-6">
      <div className="flex flex-col items-center justify-center py-8">
        {creationResult && creationResult.errors === 0 ? (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="h-8 w-8 text-green-600" />
            </div>
            <h3 className="text-lg font-medium">Anuncios Creados</h3>
            <p className="text-muted-foreground">
              Se crearon {creationResult.created} anuncios correctamente
            </p>
          </div>
        ) : (
          <div className="text-center">
            <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-yellow-600" />
            </div>
            <h3 className="text-lg font-medium">Proceso Completado</h3>
            <p className="text-muted-foreground">
              Creados: {creationResult?.created || 0} | Errores: {creationResult?.errors || 0}
            </p>
          </div>
        )}
      </div>
      <div className="space-y-1 max-h-[150px] overflow-auto text-sm">
        {creationProgress.map((progress, i) => (
          <p key={i} className="text-muted-foreground">
            {progress}
          </p>
        ))}
      </div>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            Crear Anuncios - {pkg.title}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <>
            {step === 'select' && renderStepSelect()}
            {step === 'review' && renderStepReview()}
            {step === 'creating' && renderStepCreating()}
            {step === 'complete' && renderStepComplete()}

            <div className="flex justify-between pt-4">
              {step === 'review' && (
                <Button variant="outline" onClick={handleBack}>
                  <ChevronLeft className="h-4 w-4 mr-2" />
                  Atrás
                </Button>
              )}
              {step === 'select' && <div />}

              {step === 'complete' ? (
                <Button onClick={onClose}>Cerrar</Button>
              ) : step !== 'creating' ? (
                <Button onClick={handleNext}>
                  {step === 'select' ? 'Siguiente' : 'Crear Anuncios'}
                  <ChevronRight className="h-4 w-4 ml-2" />
                </Button>
              ) : null}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
