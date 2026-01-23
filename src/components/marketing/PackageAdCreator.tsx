'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
// Checkbox removed - no longer needed for variant selection
import { toast } from 'sonner'
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Wand2,
  Check,
  AlertCircle,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Save,
  Upload,
} from 'lucide-react'

interface Package {
  id: number
  tc_package_id: number
  title: string
  current_price_per_pax: number
  currency: string
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  nights_count: number
  marketing_status: string
  ads_created_count: number
}

interface CopyVariant {
  id: number
  variant: number
  headline: string
  primary_text: string
  description: string
  wa_message_template: string
  approved: boolean
}

interface Creative {
  id: number
  variant: number
  aspect_ratio: '4x5' | '9x16'
  drive_file_id: string
  drive_thumbnail_url?: string
  creative_type: 'IMAGE' | 'VIDEO'
  upload_status: 'pending' | 'uploading' | 'uploaded' | 'error'
  meta_image_hash?: string
  meta_video_id?: string
}

interface PackageAdCreatorProps {
  pkg: Package
  onUpdate?: () => void
}

const VARIANT_LABELS: Record<number, { name: string; focus: string }> = {
  1: { name: 'Precio/Oferta', focus: 'Urgencia y ahorro' },
  2: { name: 'Experiencia', focus: 'Emocional' },
  3: { name: 'Destino', focus: 'Lugar único' },
  4: { name: 'Conveniencia', focus: 'Todo incluido' },
  5: { name: 'Escasez', focus: 'Últimos lugares' },
}

export function PackageAdCreator({ pkg, onUpdate }: PackageAdCreatorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Campaign & AdSet IDs (simple text inputs - no API calls)
  const [campaignId, setCampaignId] = useState<string>('')
  const [adSetId, setAdSetId] = useState<string>('')

  // Copies
  const [copies, setCopies] = useState<CopyVariant[]>([])
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [savingCopy, setSavingCopy] = useState<number | null>(null)
  const [editingCopy, setEditingCopy] = useState<number | null>(null)

  // Creatives
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [loadingCreatives, setLoadingCreatives] = useState(false)

  // Ad creation
  const [creatingAds, setCreatingAds] = useState(false)
  const [creationProgress, setCreationProgress] = useState<string[]>([])

  // Creative upload to Meta
  const [uploadingCreatives, setUploadingCreatives] = useState(false)

  // Campaign & AdSet lookup (names from Meta)
  const [campaignName, setCampaignName] = useState<string | null>(null)
  const [adSetName, setAdSetName] = useState<string | null>(null)
  const [lookingUpCampaign, setLookingUpCampaign] = useState(false)
  const [lookingUpAdSet, setLookingUpAdSet] = useState(false)

  // Debounced lookup for Campaign ID
  useEffect(() => {
    if (!campaignId.trim()) {
      setCampaignName(null)
      return
    }
    const timer = setTimeout(async () => {
      setLookingUpCampaign(true)
      try {
        const res = await fetch(`/api/meta/lookup?type=campaign&id=${campaignId.trim()}`)
        const data = await res.json()
        if (data.found) {
          setCampaignName(data.name)
        } else {
          setCampaignName(null)
        }
      } catch {
        setCampaignName(null)
      } finally {
        setLookingUpCampaign(false)
      }
    }, 500) // 500ms debounce
    return () => clearTimeout(timer)
  }, [campaignId])

  // Debounced lookup for AdSet ID
  useEffect(() => {
    if (!adSetId.trim()) {
      setAdSetName(null)
      return
    }
    const timer = setTimeout(async () => {
      setLookingUpAdSet(true)
      try {
        const res = await fetch(`/api/meta/lookup?type=adset&id=${adSetId.trim()}`)
        const data = await res.json()
        if (data.found) {
          setAdSetName(data.name)
        } else {
          setAdSetName(null)
        }
      } catch {
        setAdSetName(null)
      } finally {
        setLookingUpAdSet(false)
      }
    }, 500) // 500ms debounce
    return () => clearTimeout(timer)
  }, [adSetId])

  // Load data when opened - ONLY calls Drive + BD, NOT Meta API
  useEffect(() => {
    if (isOpen) {
      loadLocalData()
    }
  }, [isOpen])

  const loadLocalData = async () => {
    setIsLoading(true)
    try {
      await Promise.all([
        loadCopies(),
        loadCreatives(),
      ])
    } finally {
      setIsLoading(false)
    }
  }

  const loadCopies = async () => {
    try {
      const res = await fetch(`/api/meta/copy/${pkg.id}`)
      if (res.ok) {
        const data = await res.json()
        setCopies(data.copies || [])
      }
    } catch (error) {
      console.error('Error loading copies:', error)
    }
  }

  const loadCreatives = async () => {
    setLoadingCreatives(true)
    try {
      const res = await fetch(`/api/meta/creatives/${pkg.id}`)
      if (res.ok) {
        const data = await res.json()
        setCreatives(data.creatives || [])
        if (data.drive_error) {
          console.error('Drive error:', data.drive_error)
          toast.error(`Error Drive: ${data.drive_error}`)
        }
      }
    } catch (error) {
      console.error('Error loading creatives:', error)
    } finally {
      setLoadingCreatives(false)
    }
  }

  const handleUploadCreatives = async () => {
    // Get variants that have creatives but are not uploaded
    const pendingCreatives = creatives.filter(c => c.upload_status !== 'uploaded')
    if (pendingCreatives.length === 0) {
      toast.info('Todos los creativos ya están subidos')
      return
    }

    const variants = [...new Set(pendingCreatives.map(c => c.variant))]

    setUploadingCreatives(true)
    setCreationProgress([`Subiendo ${pendingCreatives.length} creativos a Meta...`])

    try {
      const res = await fetch('/api/meta/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [pkg.id],
          variants,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error subiendo creativos')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'progress') {
              setCreationProgress(prev => [...prev, `V${data.data.variant} ${data.data.aspect_ratio}: ${data.data.status}`])
            } else if (data.type === 'complete') {
              toast.success(`Subidos ${data.data.uploaded} creativos`)
              await loadCreatives() // Refresh creatives list
            } else if (data.type === 'error') {
              toast.error(`Error V${data.data.variant}: ${data.data.error}`)
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error subiendo creativos')
    } finally {
      setUploadingCreatives(false)
    }
  }

  const handleGenerateCopy = async () => {
    setGeneratingCopy(true)
    try {
      const res = await fetch('/api/meta/copy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: [pkg.id] }),
      })

      if (!res.ok) throw new Error('Error generando copy')

      await loadCopies()
      toast.success('Copies generados')
    } catch (error) {
      toast.error('Error generando copies')
    } finally {
      setGeneratingCopy(false)
    }
  }

  const handleSaveCopy = async (copy: CopyVariant) => {
    setSavingCopy(copy.variant)
    try {
      const res = await fetch(`/api/meta/copy/${pkg.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(copy),
      })

      if (!res.ok) throw new Error('Error guardando copy')

      const data = await res.json()
      if (data.copy) {
        setCopies(prev => prev.map(c => c.variant === data.copy.variant ? data.copy : c))
      }

      toast.success(`Variante ${copy.variant} guardada`)
      setEditingCopy(null)
    } catch (error) {
      toast.error('Error guardando copy')
    } finally {
      setSavingCopy(null)
    }
  }

  const handleCreateAds = async () => {
    if (!adSetId.trim()) {
      toast.error('Ingresa el ID del conjunto de anuncios')
      return
    }

    // Verify we have copies
    if (copies.length === 0) {
      toast.error('Genera los copies primero')
      return
    }

    // Verify we have uploaded creatives
    if (uploadedCreatives.length === 0) {
      toast.error('Sube los creativos a Meta primero')
      return
    }

    setCreatingAds(true)
    setCreationProgress([])

    try {
      // New simplified API format - no variants needed
      // The API will automatically create 1 ad per uploaded creative variant
      // Each ad will have all 5 copies as internal Meta variations
      const res = await fetch('/api/meta/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packages: [{
            package_id: pkg.id,
            meta_adset_id: adSetId.trim(),
          }],
        }),
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error creando anuncios')
      }

      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'creating') {
              const variant = data.data.creative_variant || data.data.variant
              setCreationProgress(prev => [...prev, `${variant ? `V${variant}: ` : ''}${data.data.step}`])
            } else if (data.type === 'created') {
              setCreationProgress(prev => [...prev, `V${data.data.creative_variant}: Creado (${data.data.copies_count} copys)`])
            } else if (data.type === 'complete') {
              toast.success(`Creados ${data.data.created} anuncios (cada uno con ${copies.length} copys)`)
              onUpdate?.()
            } else if (data.type === 'error') {
              const errorMsg = data.data.error || data.data.message || 'Error desconocido'
              toast.error(errorMsg)
              setCreationProgress(prev => [...prev, `Error: ${errorMsg}`])
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error creando anuncios')
    } finally {
      setCreatingAds(false)
    }
  }

  const updateCopyField = (variant: number, field: keyof CopyVariant, value: string | boolean) => {
    setCopies(prev => prev.map(c =>
      c.variant === variant ? { ...c, [field]: value } : c
    ))
  }

  const copiesReady = copies.length > 0
  const creativesReady = creatives.length > 0
  const pendingCreatives = creatives.filter(c => c.upload_status !== 'uploaded')
  const uploadedCreatives = creatives.filter(c => c.upload_status === 'uploaded')
  // Count unique uploaded creative variants (V1, V2, etc.)
  const uploadedVariants = [...new Set(uploadedCreatives.map(c => c.variant))]
  const canUploadCreatives = pendingCreatives.length > 0
  // Can create ads when we have copies, uploaded creatives, and an AdSet ID
  const canCreateAds = copiesReady && uploadedVariants.length > 0 && adSetId.trim()

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(price)
  }

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  }

  // Get creatives organized by variant
  const getCreativesByVariant = (variant: number) => {
    return creatives.filter(c => c.variant === variant)
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors py-4"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between gap-4">
          {/* Left: Package Info */}
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="font-mono shrink-0">
                  {pkg.tc_package_id}
                </Badge>
                <span className="font-medium text-sm truncate">{pkg.title}</span>
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                <span>{formatPrice(pkg.current_price_per_pax, pkg.currency)}</span>
                <span>{pkg.nights_count} noches</span>
                {pkg.date_range_start && pkg.date_range_end && (
                  <span>Rango: {formatShortDate(pkg.date_range_start)} → {formatShortDate(pkg.date_range_end)}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right: Campaign/AdSet IDs + Status */}
          <div className="flex items-center gap-4 shrink-0" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3">
              <div className="relative flex flex-col items-center">
                <Input
                  placeholder="Campaign ID"
                  value={campaignId}
                  onChange={e => setCampaignId(e.target.value)}
                  className={`w-[180px] h-10 text-sm text-center pr-8 font-mono ${campaignName ? 'border-green-500' : campaignId && !lookingUpCampaign ? 'border-red-500' : ''}`}
                  onClick={e => e.stopPropagation()}
                  title={campaignName || 'Ingresa Campaign ID'}
                />
                {lookingUpCampaign && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-3 text-muted-foreground" />
                )}
                {!lookingUpCampaign && campaignName && (
                  <Check className="h-4 w-4 absolute right-2 top-3 text-green-500" />
                )}
                {campaignName && (
                  <span className="text-[10px] text-blue-600 truncate max-w-[180px] mt-0.5">📢 {campaignName}</span>
                )}
              </div>
              <div className="relative flex flex-col items-center">
                <Input
                  placeholder="AdSet ID *"
                  value={adSetId}
                  onChange={e => setAdSetId(e.target.value)}
                  className={`w-[180px] h-10 text-sm text-center pr-8 font-mono ${adSetName ? 'border-green-500' : adSetId && !lookingUpAdSet ? 'border-red-500' : ''}`}
                  onClick={e => e.stopPropagation()}
                  title={adSetName || 'Ingresa AdSet ID'}
                />
                {lookingUpAdSet && (
                  <Loader2 className="h-4 w-4 animate-spin absolute right-2 top-3 text-muted-foreground" />
                )}
                {!lookingUpAdSet && adSetName && (
                  <Check className="h-4 w-4 absolute right-2 top-3 text-green-500" />
                )}
                {adSetName && (
                  <span className="text-[10px] text-green-600 truncate max-w-[180px] mt-0.5">📦 {adSetName}</span>
                )}
              </div>
            </div>

            {/* Status badges */}
            <div className="flex items-center gap-1.5">
              <Badge variant={copiesReady ? 'default' : 'secondary'} className="text-xs">
                {copiesReady ? <Check className="h-3 w-3 mr-1" /> : null}
                Copy
              </Badge>
              <Badge
                variant={uploadedCreatives.length > 0 ? 'default' : creativesReady ? 'secondary' : 'outline'}
                className="text-xs"
              >
                {uploadedCreatives.length > 0 ? (
                  <Check className="h-3 w-3 mr-1" />
                ) : pendingCreatives.length > 0 ? (
                  <Upload className="h-3 w-3 mr-1" />
                ) : null}
                {uploadedCreatives.length > 0
                  ? `${uploadedCreatives.length} Subidos`
                  : pendingCreatives.length > 0
                    ? `${pendingCreatives.length} Pendientes`
                    : 'Sin creativos'}
              </Badge>
              {pkg.ads_created_count > 0 && (
                <Badge variant="outline" className="text-xs text-green-600">
                  {pkg.ads_created_count} Ads
                </Badge>
              )}
            </div>

            <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer p-1">
              {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
            </div>
          </div>
        </div>
      </CardHeader>

      {isOpen && (
        <CardContent className="border-t pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Two Column Layout: Creatives (Left) | Copies (Right) */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* LEFT: Creatives */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <ImageIcon className="h-4 w-4" />
                      Creativos ({creatives.length})
                      {pendingCreatives.length > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {pendingCreatives.length} pendientes
                        </Badge>
                      )}
                    </h3>
                    <div className="flex items-center gap-2">
                      {canUploadCreatives && (
                        <Button
                          variant="default"
                          size="sm"
                          onClick={handleUploadCreatives}
                          disabled={uploadingCreatives}
                        >
                          {uploadingCreatives ? (
                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                          ) : (
                            <Upload className="h-4 w-4 mr-1" />
                          )}
                          Subir a Meta
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadCreatives}
                        disabled={loadingCreatives}
                      >
                        {loadingCreatives ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {creatives.length === 0 ? (
                    <div className="text-center py-8 bg-muted/30 rounded-lg">
                      <ImageIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No hay creativos</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Se cargarán desde Drive
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Info banner explaining the logic */}
                      {uploadedVariants.length > 0 && (
                        <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
                          <strong>{uploadedVariants.length} creativo(s) subido(s)</strong> = <strong>{uploadedVariants.length} anuncio(s)</strong> a crear.
                          Cada anuncio tendrá los {copies.length || 5} copys como variaciones internas.
                        </div>
                      )}
                      {[1, 2, 3, 4, 5].map(variant => {
                        const variantCreatives = getCreativesByVariant(variant)
                        if (variantCreatives.length === 0) return null
                        const isUploaded = variantCreatives.some(c => c.upload_status === 'uploaded')

                        return (
                          <div
                            key={variant}
                            className={`p-3 border rounded-lg ${
                              isUploaded
                                ? 'border-green-500 bg-green-50'
                                : 'border-border'
                            }`}
                          >
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant={isUploaded ? 'default' : 'outline'} className="text-xs">
                                V{variant}
                              </Badge>
                              <span className="text-xs font-medium">
                                {VARIANT_LABELS[variant]?.name}
                              </span>
                              {isUploaded && (
                                <Badge variant="secondary" className="text-xs text-green-600">
                                  = 1 anuncio
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {variantCreatives.map(creative => {
                                // Generate Google Drive thumbnail URL
                                const thumbnailUrl = creative.drive_file_id
                                  ? `https://drive.google.com/thumbnail?id=${creative.drive_file_id}&sz=w200`
                                  : null

                                return (
                                  <div
                                    key={creative.id || `${creative.variant}-${creative.aspect_ratio}`}
                                    className="flex flex-col items-center p-2 bg-muted/50 rounded relative group"
                                  >
                                    <div
                                      className={`relative overflow-hidden rounded ${
                                        creative.aspect_ratio === '9x16'
                                          ? 'w-10 h-16'
                                          : 'w-14 h-16'
                                      }`}
                                    >
                                      {thumbnailUrl ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={thumbnailUrl}
                                          alt={`V${creative.variant} ${creative.aspect_ratio}`}
                                          className="w-full h-full object-cover"
                                          loading="lazy"
                                          referrerPolicy="no-referrer"
                                          onError={(e) => {
                                            // Fallback to icon if thumbnail fails to load
                                            const target = e.target as HTMLImageElement
                                            target.style.display = 'none'
                                            target.nextElementSibling?.classList.remove('hidden')
                                          }}
                                        />
                                      ) : null}
                                      {/* Fallback icon (shown if no URL or image fails to load) */}
                                      <div className={`absolute inset-0 flex items-center justify-center bg-muted/80 ${thumbnailUrl ? 'hidden' : ''}`}>
                                        {creative.creative_type === 'VIDEO' ? (
                                          <Video className="h-6 w-6 text-muted-foreground" />
                                        ) : (
                                          <ImageIcon className="h-6 w-6 text-muted-foreground" />
                                        )}
                                      </div>
                                      {/* Video indicator overlay */}
                                      {creative.creative_type === 'VIDEO' && thumbnailUrl && (
                                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                                          <Video className="h-5 w-5 text-white" />
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-muted-foreground mt-1">
                                      {creative.aspect_ratio}
                                    </span>
                                    <div className="flex items-center gap-1 mt-0.5">
                                      {creative.upload_status === 'uploaded' ? (
                                        <Check className="h-3 w-3 text-green-600" />
                                      ) : (
                                        <Upload className="h-3 w-3 text-amber-500" />
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* RIGHT: Copies */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium flex items-center gap-2">
                      <Wand2 className="h-4 w-4" />
                      Copies ({copies.length}/5)
                    </h3>
                    <Button
                      variant={copies.length > 0 ? 'outline' : 'default'}
                      size="sm"
                      onClick={handleGenerateCopy}
                      disabled={generatingCopy}
                    >
                      {generatingCopy ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : copies.length > 0 ? (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      ) : (
                        <Wand2 className="h-4 w-4 mr-2" />
                      )}
                      {copies.length > 0 ? 'Regenerar' : 'Generar'}
                    </Button>
                  </div>

                  {copies.length === 0 ? (
                    <div className="text-center py-8 bg-muted/30 rounded-lg">
                      <Wand2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
                      <p className="text-sm text-muted-foreground">No hay copies</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Genera con IA
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                      {/* Info explaining all copies go into each ad */}
                      <div className="p-2 bg-purple-50 border border-purple-200 rounded-lg text-xs text-purple-700">
                        Todos los {copies.length} copys se usarán como variaciones internas en cada anuncio.
                        Meta optimizará automáticamente cuál mostrar.
                      </div>
                      {copies.map(copy => (
                        <div
                          key={copy.variant}
                          className="p-3 border rounded-lg border-border"
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-2">
                                <Badge variant="outline" className="text-xs">Copy {copy.variant}</Badge>
                                <span className="text-xs font-medium">
                                  {VARIANT_LABELS[copy.variant]?.name}
                                </span>
                              </div>

                              {editingCopy === copy.variant ? (
                                <div className="space-y-2">
                                  <div>
                                    <Label className="text-xs">Headline (max 40)</Label>
                                    <Input
                                      value={copy.headline}
                                      onChange={e => updateCopyField(copy.variant, 'headline', e.target.value)}
                                      maxLength={40}
                                      className="h-8 text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Texto principal</Label>
                                    <Textarea
                                      value={copy.primary_text}
                                      onChange={e => updateCopyField(copy.variant, 'primary_text', e.target.value)}
                                      rows={3}
                                      className="text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Titulo CTA (max 125)</Label>
                                    <Input
                                      value={copy.description}
                                      onChange={e => updateCopyField(copy.variant, 'description', e.target.value)}
                                      maxLength={125}
                                      className="h-8 text-sm"
                                      placeholder="Descripción del botón CTA"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Mensaje WhatsApp</Label>
                                    <Textarea
                                      value={copy.wa_message_template}
                                      onChange={e => updateCopyField(copy.variant, 'wa_message_template', e.target.value)}
                                      rows={2}
                                      className="font-mono text-xs"
                                    />
                                  </div>
                                  <div className="flex gap-2 pt-1">
                                    <Button
                                      size="sm"
                                      onClick={() => handleSaveCopy(copy)}
                                      disabled={savingCopy === copy.variant}
                                      className="h-7"
                                    >
                                      {savingCopy === copy.variant ? (
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                      ) : (
                                        <Save className="h-3 w-3 mr-1" />
                                      )}
                                      Guardar
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => setEditingCopy(null)}
                                      className="h-7"
                                    >
                                      Cancelar
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div
                                  className="cursor-pointer hover:bg-muted/50 rounded p-1 -m-1"
                                  onClick={() => setEditingCopy(copy.variant)}
                                >
                                  <p className="font-medium text-sm truncate">{copy.headline}</p>
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                    {copy.primary_text}
                                  </p>
                                  {copy.description && (
                                    <p className="text-xs text-muted-foreground mt-1 italic">
                                      CTA: {copy.description}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Create Ads Button */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {!adSetId.trim() && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      Ingresa AdSet ID arriba
                    </span>
                  )}
                  {adSetId.trim() && uploadedVariants.length === 0 && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      Sube los creativos a Meta primero
                    </span>
                  )}
                  {adSetId.trim() && uploadedVariants.length > 0 && !copiesReady && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      Genera los copies primero
                    </span>
                  )}
                  {canCreateAds && (
                    <span className="text-green-700">
                      Crear <strong>{uploadedVariants.length} anuncio{uploadedVariants.length > 1 ? 's' : ''}</strong> (cada uno con {copies.length} copys)
                    </span>
                  )}
                </div>

                <Button
                  size="lg"
                  onClick={handleCreateAds}
                  disabled={!canCreateAds || creatingAds}
                >
                  {creatingAds ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Creando...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Crear {uploadedVariants.length > 0 ? `${uploadedVariants.length} Anuncio${uploadedVariants.length > 1 ? 's' : ''}` : 'Anuncios'}
                    </>
                  )}
                </Button>
              </div>

              {/* Creation Progress */}
              {creationProgress.length > 0 && (
                <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                  {creationProgress.map((msg, i) => (
                    <p key={i} className="text-muted-foreground">{msg}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
