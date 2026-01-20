'use client'

import { useState, useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import {
  Loader2,
  Wand2,
  Check,
  Upload,
  Image as ImageIcon,
  Video,
  RefreshCw,
  Save,
  PlusCircle,
  CirclePlay,
  CirclePause,
  CircleX,
  CircleAlert,
  Trash2,
  Plus,
  UploadCloud,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface Package {
  id: number
  tc_package_id: number
  title: string
  current_price_per_pax: number
  currency: string
  nights_count: number
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
  id?: number
  variant: number
  aspect_ratio: '4x5' | '9x16'
  drive_file_id?: string
  creative_type: 'IMAGE' | 'VIDEO'
  upload_status: 'pending' | 'uploading' | 'uploaded' | 'error'
  meta_image_hash?: string
  meta_video_id?: string
}

interface DriveCreative {
  variant: number
  aspectRatio: '4x5' | '9x16'
  fileId: string
  webViewLink: string
}

interface ExistingAd {
  id: number
  variant: number
  meta_ad_id: string
  status: string
  meta_status?: string | null
  last_synced_at?: string | null
}

// Status color mapping for Meta ad statuses
const AD_STATUS_CONFIG: Record<string, { color: string; bgColor: string; icon: typeof CirclePlay; label: string }> = {
  ACTIVE: { color: 'text-green-700', bgColor: 'bg-green-100', icon: CirclePlay, label: 'Activo' },
  PAUSED: { color: 'text-yellow-700', bgColor: 'bg-yellow-100', icon: CirclePause, label: 'Pausado' },
  DELETED: { color: 'text-red-700', bgColor: 'bg-red-100', icon: CircleX, label: 'Eliminado' },
  PENDING_REVIEW: { color: 'text-blue-700', bgColor: 'bg-blue-100', icon: CircleAlert, label: 'En revisión' },
  DISAPPROVED: { color: 'text-red-700', bgColor: 'bg-red-100', icon: CircleX, label: 'Rechazado' },
  ARCHIVED: { color: 'text-gray-700', bgColor: 'bg-gray-100', icon: CircleX, label: 'Archivado' },
  // Default for unknown statuses
  DEFAULT: { color: 'text-gray-700', bgColor: 'bg-gray-100', icon: CircleAlert, label: 'Desconocido' },
}

interface PackageRowExpandedProps {
  pkg: Package
  campaignId: string
  adSetId: string
  onUpdate: () => void
  onDataUpdate: (updates: { copiesCount?: number; creativesCount?: number; uploadedCreativesCount?: number }) => void
  onRequestCreative?: () => void
}

const VARIANT_LABELS: Record<number, { name: string; focus: string }> = {
  1: { name: 'Precio/Oferta', focus: 'Urgencia y ahorro' },
  2: { name: 'Experiencia', focus: 'Emocional' },
  3: { name: 'Destino', focus: 'Lugar unico' },
  4: { name: 'Conveniencia', focus: 'Todo incluido' },
  5: { name: 'Escasez', focus: 'Ultimos lugares' },
}

export function PackageRowExpanded({
  pkg,
  campaignId,
  adSetId,
  onUpdate,
  onDataUpdate,
  onRequestCreative,
}: PackageRowExpandedProps) {
  const [copies, setCopies] = useState<CopyVariant[]>([])
  const [creatives, setCreatives] = useState<Creative[]>([])
  const [driveCreatives, setDriveCreatives] = useState<DriveCreative[]>([])
  const [existingAds, setExistingAds] = useState<ExistingAd[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [generatingCopy, setGeneratingCopy] = useState(false)
  const [uploadingCreatives, setUploadingCreatives] = useState(false)
  const [creatingAds, setCreatingAds] = useState(false)
  const [editingCopy, setEditingCopy] = useState<number | null>(null)
  const [savingCopy, setSavingCopy] = useState<number | null>(null)
  const [creationProgress, setCreationProgress] = useState<string[]>([])
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null)
  // Selection state for variant actions
  const [selectedVariants, setSelectedVariants] = useState<number[]>([])
  const [deletingAds, setDeletingAds] = useState(false)

  // Manual upload state
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [manualUploadTarget, setManualUploadTarget] = useState<{ variant: number; aspectRatio: '4x5' | '9x16' } | null>(null)
  const [manualUploading, setManualUploading] = useState(false)
  // Local previews for manually uploaded files (key: `${variant}-${aspectRatio}`)
  const [localPreviews, setLocalPreviews] = useState<Record<string, { url: string; type: 'image' | 'video' }>>({})
  // Meta image URLs fetched from Meta API (key: image_hash, value: url)
  const [metaImageUrls, setMetaImageUrls] = useState<Record<string, string>>({})
  // Meta video thumbnail URLs fetched from Meta API (key: video_id, value: thumbnail_url)
  const [metaVideoUrls, setMetaVideoUrls] = useState<Record<string, string>>({})

  // Update ad state
  const [updatingAdVariant, setUpdatingAdVariant] = useState<number | null>(null)
  const [updatingSelectedAds, setUpdatingSelectedAds] = useState(false)

  useEffect(() => {
    loadData()
  }, [pkg.id])

  // Cleanup blob URLs on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      Object.values(localPreviews).forEach(preview => {
        URL.revokeObjectURL(preview.url)
      })
    }
  }, [localPreviews])

  const loadData = async () => {
    setIsLoading(true)
    try {
      await Promise.all([loadCopies(), loadCreatives(), loadExistingAds()])
    } finally {
      setIsLoading(false)
    }
  }

  const loadExistingAds = async () => {
    try {
      // Try by package_id first, then by tc_package_id
      let res = await fetch(`/api/meta/ads?package_id=${pkg.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.ads && data.ads.length > 0) {
          setExistingAds(data.ads)
          // Sync with Meta to get real statuses
          syncAdsWithMeta()
          return
        }
      }

      // Fallback to tc_package_id
      res = await fetch(`/api/meta/ads?tc_package_id=${pkg.tc_package_id}`)
      if (res.ok) {
        const data = await res.json()
        setExistingAds(data.ads || [])
        if (data.ads && data.ads.length > 0) {
          // Sync with Meta to get real statuses
          syncAdsWithMeta()
        }
      }
    } catch (error) {
      console.error('Error loading existing ads:', error)
    }
  }

  // Sync ads with Meta API to get real statuses
  const syncAdsWithMeta = async () => {
    setIsSyncing(true)
    try {
      const res = await fetch('/api/meta/ads/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: pkg.id }),
      })

      if (res.ok) {
        const data = await res.json()
        if (data.synced_ads && data.synced_ads.length > 0) {
          // Update existing ads with synced data
          setExistingAds(prev =>
            prev.map(ad => {
              const syncedAd = data.synced_ads.find((s: ExistingAd) => s.id === ad.id)
              if (syncedAd) {
                return {
                  ...ad,
                  meta_status: syncedAd.meta_status,
                  status: syncedAd.meta_status || ad.status,
                  last_synced_at: syncedAd.last_synced_at,
                }
              }
              return ad
            })
          )
          setLastSyncedAt(new Date().toISOString())

          // Show notification about deleted ads
          if (data.deleted_count > 0) {
            toast.warning(`${data.deleted_count} anuncio${data.deleted_count > 1 ? 's' : ''} eliminado${data.deleted_count > 1 ? 's' : ''} en Meta`)
          }
        }
      }
    } catch (error) {
      console.error('Error syncing ads with Meta:', error)
    } finally {
      setIsSyncing(false)
    }
  }

  const loadCopies = async () => {
    try {
      const res = await fetch(`/api/meta/copy/${pkg.id}`)
      if (res.ok) {
        const data = await res.json()
        setCopies(data.copies || [])
        onDataUpdate({ copiesCount: data.copies?.length || 0 })
      }
    } catch (error) {
      console.error('Error loading copies:', error)
    }
  }

  const loadCreatives = async () => {
    try {
      // Load from both endpoints - Drive creatives (always has fileId) and Meta creatives (has upload status)
      const [driveRes, metaRes] = await Promise.all([
        fetch(`/api/creatives/${pkg.id}`),
        fetch(`/api/meta/creatives/${pkg.id}`),
      ])

      // Get drive creatives (always has the correct fileId for thumbnails)
      if (driveRes.ok) {
        const driveData = await driveRes.json()
        setDriveCreatives(driveData.creatives || [])
      }

      // Get meta creatives (has upload status)
      if (metaRes.ok) {
        const metaData = await metaRes.json()
        const metaCreatives = metaData.creatives || []
        setCreatives(metaCreatives)
        const uploadedCount = metaCreatives.filter((c: Creative) => c.upload_status === 'uploaded').length || 0
        onDataUpdate({
          creativesCount: metaCreatives.length || 0,
          uploadedCreativesCount: uploadedCount,
        })

        // Fetch Meta image URLs and video thumbnails for uploaded creatives
        const hashes = metaCreatives
          .filter((c: Creative) => c.upload_status === 'uploaded' && c.meta_image_hash)
          .map((c: Creative) => c.meta_image_hash as string)

        const videoIds = metaCreatives
          .filter((c: Creative) => c.upload_status === 'uploaded' && c.meta_video_id)
          .map((c: Creative) => c.meta_video_id as string)

        if (hashes.length > 0 || videoIds.length > 0) {
          try {
            const imgRes = await fetch('/api/meta/images', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ hashes, videoIds }),
            })
            if (imgRes.ok) {
              const imgData = await imgRes.json()
              setMetaImageUrls(imgData.urls || {})
              setMetaVideoUrls(imgData.videoUrls || {})
            }
          } catch (err) {
            console.error('Error fetching Meta media URLs:', err)
          }
        }
      }
    } catch (error) {
      console.error('Error loading creatives:', error)
    }
  }

  const handleGenerateCopy = async () => {
    setGeneratingCopy(true)
    try {
      // If variants are selected, only regenerate those; otherwise regenerate all
      const variantsToGenerate = selectedVariants.length > 0 ? selectedVariants : undefined

      const res = await fetch('/api/meta/copy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [pkg.id],
          variants: variantsToGenerate,
        }),
      })

      if (!res.ok) throw new Error('Error generando copy')

      await loadCopies()

      if (variantsToGenerate) {
        toast.success(`Copies regenerados para V${variantsToGenerate.join(', V')}`)
      } else {
        toast.success('Copies generados')
      }
    } catch {
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
    } catch {
      toast.error('Error guardando copy')
    } finally {
      setSavingCopy(null)
    }
  }

  const handleUploadCreatives = async () => {
    const pendingCreatives = creatives.filter(c => c.upload_status !== 'uploaded')
    if (pendingCreatives.length === 0) {
      toast.info('Todos los creativos ya estan subidos')
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
              await loadCreatives()
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

  // Trigger manual file selection
  const triggerManualUpload = (variant: number, aspectRatio: '4x5' | '9x16') => {
    setManualUploadTarget({ variant, aspectRatio })
    fileInputRef.current?.click()
  }

  // Handle manual file upload to Meta
  const handleManualFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !manualUploadTarget) {
      setManualUploadTarget(null)
      return
    }

    const { variant, aspectRatio } = manualUploadTarget
    const isVideo = file.type.startsWith('video/')
    const isImage = file.type.startsWith('image/')

    if (!isVideo && !isImage) {
      toast.error('Archivo no soportado. Solo imágenes o videos.')
      setManualUploadTarget(null)
      event.target.value = ''
      return
    }

    setManualUploading(true)
    setCreationProgress([`Subiendo ${isVideo ? 'video' : 'imagen'} V${variant} ${aspectRatio} a Meta...`])

    // Create local preview immediately
    const previewKey = `${variant}-${aspectRatio}`
    const blobUrl = URL.createObjectURL(file)
    setLocalPreviews(prev => ({
      ...prev,
      [previewKey]: { url: blobUrl, type: isVideo ? 'video' : 'image' }
    }))

    try {
      // Create FormData for the upload
      const formData = new FormData()
      formData.append('file', file)
      formData.append('package_id', pkg.id.toString())
      formData.append('tc_package_id', pkg.tc_package_id.toString())
      formData.append('variant', variant.toString())
      formData.append('aspect_ratio', aspectRatio)
      formData.append('creative_type', isVideo ? 'VIDEO' : 'IMAGE')

      const res = await fetch('/api/meta/creatives/manual-upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error subiendo archivo')
      }

      setCreationProgress(prev => [...prev, `V${variant} ${aspectRatio}: Subido exitosamente`])
      toast.success(`V${variant} ${aspectRatio} subido a Meta`)

      // Reload creatives to show the new upload
      await loadCreatives()
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error subiendo archivo'
      setCreationProgress(prev => [...prev, `Error: ${errorMsg}`])
      toast.error(errorMsg)
      // Clear local preview on error
      setLocalPreviews(prev => {
        const updated = { ...prev }
        delete updated[previewKey]
        return updated
      })
      URL.revokeObjectURL(blobUrl)
    } finally {
      setManualUploading(false)
      setManualUploadTarget(null)
      event.target.value = ''
    }
  }

  // Update existing ad with new creatives from database
  const handleUpdateAd = async (variant: number) => {
    const existingAd = existingAds.find(a => a.variant === variant)
    if (!existingAd) {
      toast.error('No hay anuncio existente para actualizar')
      return
    }

    // Check if there are uploaded creatives for this variant
    const variantCreatives = creatives.filter(c => c.variant === variant && c.upload_status === 'uploaded')
    if (variantCreatives.length === 0) {
      toast.error('No hay creativos subidos para esta variante')
      return
    }

    setUpdatingAdVariant(variant)
    setCreationProgress([`Actualizando anuncio V${variant}...`])

    try {
      const res = await fetch('/api/meta/ads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ads: [{
            ad_id: existingAd.id,
            meta_ad_id: existingAd.meta_ad_id,
            package_id: pkg.id,
            variant: variant,
            update_creative: true,
            update_copy: true,
          }],
        }),
      })

      if (!res.ok && !res.headers.get('content-type')?.includes('text/event-stream')) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error actualizando anuncio')
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'updating') {
              setCreationProgress(prev => [...prev, `V${variant}: ${data.data.step}`])
            } else if (data.type === 'updated') {
              setCreationProgress(prev => [...prev, `V${variant}: Anuncio actualizado`])
              toast.success(`V${variant} actualizado en Meta`)
              await loadExistingAds()
            } else if (data.type === 'error') {
              const errorMsg = data.data.error || 'Error desconocido'
              setCreationProgress(prev => [...prev, `Error V${variant}: ${errorMsg}`])
              toast.error(errorMsg)
            } else if (data.type === 'complete') {
              if (data.data.errors > 0) {
                toast.error(`Actualización completada con ${data.data.errors} error(es)`)
              }
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error actualizando anuncio'
      setCreationProgress(prev => [...prev, `Error: ${errorMsg}`])
      toast.error(errorMsg)
    } finally {
      setUpdatingAdVariant(null)
    }
  }

  const updateCopyField = (variant: number, field: keyof CopyVariant, value: string | boolean) => {
    setCopies(prev => prev.map(c =>
      c.variant === variant ? { ...c, [field]: value } : c
    ))
  }

  // Toggle variant selection
  const toggleVariantSelection = (variant: number) => {
    setSelectedVariants(prev =>
      prev.includes(variant)
        ? prev.filter(v => v !== variant)
        : [...prev, variant]
    )
  }

  // Select/deselect all variants
  const toggleSelectAll = () => {
    if (selectedVariants.length === 5) {
      setSelectedVariants([])
    } else {
      setSelectedVariants([1, 2, 3, 4, 5])
    }
  }

  // Delete selected ads from database
  const handleDeleteSelectedAds = async () => {
    const adsToDelete = existingAds.filter(ad => selectedVariants.includes(ad.variant))
    if (adsToDelete.length === 0) {
      toast.error('No hay anuncios para eliminar en las variantes seleccionadas')
      return
    }

    setDeletingAds(true)
    try {
      const res = await fetch('/api/meta/ads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ad_ids: adsToDelete.map(ad => ad.id),
          delete_from_meta: false, // Only delete from DB, Meta ads might already be deleted
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error eliminando anuncios')
      }

      // Remove deleted ads from state
      setExistingAds(prev => prev.filter(ad => !selectedVariants.includes(ad.variant)))
      setSelectedVariants([])
      toast.success(`${adsToDelete.length} anuncio${adsToDelete.length > 1 ? 's' : ''} eliminado${adsToDelete.length > 1 ? 's' : ''} de la BD`)
      onUpdate()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error eliminando anuncios')
    } finally {
      setDeletingAds(false)
    }
  }

  // Update selected ads with new creatives and copies
  const handleUpdateSelectedAds = async () => {
    // Get ads that match selected variants
    const adsToUpdate = existingAds.filter(ad => selectedVariants.includes(ad.variant))
    if (adsToUpdate.length === 0) {
      toast.error('No hay anuncios para actualizar en las variantes seleccionadas')
      return
    }

    // Check if selected variants have uploaded creatives
    const variantsWithCreatives = adsToUpdate.filter(ad => {
      const hasUploaded = creatives.some(c => c.variant === ad.variant && c.upload_status === 'uploaded')
      const hasLocal = localPreviews[`${ad.variant}-4x5`] || localPreviews[`${ad.variant}-9x16`]
      return hasUploaded || hasLocal
    })

    if (variantsWithCreatives.length === 0) {
      toast.error('Las variantes seleccionadas no tienen creativos subidos')
      return
    }

    setUpdatingSelectedAds(true)
    setCreationProgress([`Actualizando ${variantsWithCreatives.length} anuncio${variantsWithCreatives.length > 1 ? 's' : ''}...`])

    try {
      const res = await fetch('/api/meta/ads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ads: variantsWithCreatives.map(ad => ({
            ad_id: ad.id,
            meta_ad_id: ad.meta_ad_id,
            package_id: pkg.id,
            variant: ad.variant,
            update_creative: true,
            update_copy: true,
          })),
        }),
      })

      if (!res.ok && !res.headers.get('content-type')?.includes('text/event-stream')) {
        const errorData = await res.json()
        throw new Error(errorData.error || 'Error actualizando anuncios')
      }

      // Read SSE stream
      const reader = res.body?.getReader()
      if (!reader) throw new Error('No response stream')

      const decoder = new TextDecoder()
      let successCount = 0
      let errorCount = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n').filter(l => l.startsWith('data: '))

        for (const line of lines) {
          try {
            const data = JSON.parse(line.slice(6))
            if (data.type === 'updating') {
              setCreationProgress(prev => [...prev, `V${data.data.variant}: ${data.data.step}`])
            } else if (data.type === 'updated') {
              successCount++
              setCreationProgress(prev => [...prev, `V${data.data.variant}: Anuncio actualizado`])
            } else if (data.type === 'error') {
              errorCount++
              const errorMsg = data.data.error || 'Error desconocido'
              setCreationProgress(prev => [...prev, `Error V${data.data.variant}: ${errorMsg}`])
            } else if (data.type === 'complete') {
              if (successCount > 0) {
                toast.success(`${successCount} anuncio${successCount > 1 ? 's' : ''} actualizado${successCount > 1 ? 's' : ''}`)
              }
              if (errorCount > 0) {
                toast.error(`${errorCount} error${errorCount > 1 ? 'es' : ''} al actualizar`)
              }
              await loadExistingAds()
              setSelectedVariants([])
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Error actualizando anuncios'
      setCreationProgress(prev => [...prev, `Error: ${errorMsg}`])
      toast.error(errorMsg)
    } finally {
      setUpdatingSelectedAds(false)
    }
  }

  // Create ads for selected variants only
  const handleCreateSelectedAds = async () => {
    if (!adSetId?.trim()) {
      toast.error('Ingresa el ID del AdSet en la tabla')
      return
    }

    if (copies.length === 0) {
      toast.error('Genera los copies primero')
      return
    }

    // Check which selected variants have creatives in Drive
    const selectedWithDriveCreatives = selectedVariants.filter(variant =>
      driveCreatives.some(c => c.variant === variant)
    )

    if (selectedWithDriveCreatives.length === 0) {
      toast.error('Las variantes seleccionadas no tienen creativos en Drive')
      return
    }

    // Check which selected variants need their creatives uploaded to Meta
    const variantsNeedingUpload = selectedWithDriveCreatives.filter(variant => {
      const hasUploaded = creatives.some(c => c.variant === variant && c.upload_status === 'uploaded')
      return !hasUploaded
    })

    setCreatingAds(true)
    setCreationProgress([])

    try {
      // Step 1: Upload creatives to Meta if needed
      if (variantsNeedingUpload.length > 0) {
        setCreationProgress([`Subiendo creativos para V${variantsNeedingUpload.join(', V')} a Meta...`])

        const uploadRes = await fetch('/api/meta/creatives', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            packageIds: [pkg.id],
            variants: variantsNeedingUpload,
          }),
        })

        if (!uploadRes.ok) {
          const errorData = await uploadRes.json()
          throw new Error(errorData.error || 'Error subiendo creativos')
        }

        // Read the SSE stream for upload progress
        const uploadReader = uploadRes.body?.getReader()
        if (uploadReader) {
          const decoder = new TextDecoder()
          while (true) {
            const { done, value } = await uploadReader.read()
            if (done) break

            const text = decoder.decode(value)
            const lines = text.split('\n').filter(l => l.startsWith('data: '))

            for (const line of lines) {
              try {
                const data = JSON.parse(line.slice(6))
                if (data.type === 'progress') {
                  setCreationProgress(prev => [...prev, `V${data.data.variant} ${data.data.aspect_ratio}: ${data.data.status}`])
                } else if (data.type === 'complete') {
                  setCreationProgress(prev => [...prev, `Creativos subidos: ${data.data.uploaded}`])
                } else if (data.type === 'error') {
                  setCreationProgress(prev => [...prev, `Error V${data.data.variant}: ${data.data.error}`])
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }

        // Refresh creatives data after upload
        await loadCreatives()
      }

      // Step 2: Create ads in Meta (only for selected variants)
      setCreationProgress(prev => [...prev, `Creando anuncios para V${selectedWithDriveCreatives.join(', V')} en Meta...`])

      const res = await fetch('/api/meta/ads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packages: [{
            package_id: pkg.id,
            meta_adset_id: adSetId?.trim(),
            variants: selectedWithDriveCreatives, // Only create ads for selected variants
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
              toast.success(`Creados ${data.data.created} anuncios`)
              setSelectedVariants([])
              await loadExistingAds()
              onUpdate()
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

  // Combine drive and meta creatives for counts
  const allCreativeVariants = new Set([
    ...creatives.map(c => c.variant),
    ...driveCreatives.map(c => c.variant),
  ])
  const pendingCreatives = creatives.filter(c => c.upload_status !== 'uploaded')
  const uploadedCreatives = creatives.filter(c => c.upload_status === 'uploaded')
  const uploadedVariants = [...new Set(uploadedCreatives.map(c => c.variant))]
  const totalCreativesCount = driveCreatives.length || creatives.length

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Hidden file input for manual upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleManualFileUpload}
        accept="image/*,video/*"
        className="hidden"
      />

      {/* Existing Ads Summary with Meta Status */}
      {existingAds.length > 0 && (
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Check className="h-4 w-4 text-blue-600" />
              <span>{existingAds.length} anuncio{existingAds.length > 1 ? 's' : ''} en Meta</span>
              {isSyncing && (
                <span className="text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Sincronizando...
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={syncAdsWithMeta}
              disabled={isSyncing}
              className="h-7 px-2 text-xs"
            >
              <RefreshCw className={`h-3 w-3 mr-1 ${isSyncing ? 'animate-spin' : ''}`} />
              Sincronizar
            </Button>
          </div>

          {/* Ads Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Variante</th>
                  <th className="text-left px-3 py-2 font-medium">Ad ID</th>
                  <th className="text-left px-3 py-2 font-medium">Estado en Meta</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {existingAds.map(ad => {
                  const statusKey = ad.meta_status || ad.status || 'DEFAULT'
                  const statusConfig = AD_STATUS_CONFIG[statusKey] || AD_STATUS_CONFIG.DEFAULT
                  const StatusIcon = statusConfig.icon

                  return (
                    <tr key={ad.id} className={ad.meta_status === 'DELETED' ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-2">
                        <Badge variant="outline" className="text-xs">
                          V{ad.variant}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">
                        {ad.meta_ad_id}
                      </td>
                      <td className="px-3 py-2">
                        <div className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                          <StatusIcon className="h-3 w-3" />
                          {statusConfig.label}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Summary stats */}
          <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CirclePlay className="h-3 w-3 text-green-600" />
              {existingAds.filter(a => a.meta_status === 'ACTIVE' || a.status === 'ACTIVE').length} activos
            </span>
            <span className="flex items-center gap-1">
              <CirclePause className="h-3 w-3 text-yellow-600" />
              {existingAds.filter(a => a.meta_status === 'PAUSED' || a.status === 'PAUSED').length} pausados
            </span>
            <span className="flex items-center gap-1">
              <CircleX className="h-3 w-3 text-red-600" />
              {existingAds.filter(a => a.meta_status === 'DELETED').length} eliminados
            </span>
            {lastSyncedAt && (
              <span className="ml-auto">
                Última sincronización: {new Date(lastSyncedAt).toLocaleTimeString('es-AR')}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h3 className="font-medium flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Creativos ({creatives.length})
          </h3>
          <h3 className="font-medium flex items-center gap-2">
            <Wand2 className="h-4 w-4" />
            Copies ({copies.length}/5)
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {onRequestCreative && (
            <Button variant="outline" size="sm" onClick={onRequestCreative}>
              <PlusCircle className="h-4 w-4 mr-1" />
              Solicitar Creativos
            </Button>
          )}
          {pendingCreatives.length > 0 && (
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
              Subir a Meta ({pendingCreatives.length})
            </Button>
          )}
          <Button
            variant={copies.length > 0 ? 'outline' : 'default'}
            size="sm"
            onClick={handleGenerateCopy}
            disabled={generatingCopy}
          >
            {generatingCopy ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4 mr-1" />
            )}
            {copies.length > 0
              ? selectedVariants.length > 0
                ? `Regenerar V${selectedVariants.sort((a, b) => a - b).join(', V')}`
                : 'Regenerar Copies'
              : 'Generar Copies'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadCreatives}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Variants List - Each variant with its creatives and copy */}
      <div className="space-y-4">
        {/* Selection header with action buttons */}
        <div className="flex items-center justify-between bg-muted/30 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedVariants.length === 5}
              onCheckedChange={toggleSelectAll}
              id="select-all"
            />
            <label htmlFor="select-all" className="text-sm cursor-pointer">
              {selectedVariants.length === 0
                ? 'Seleccionar variantes'
                : selectedVariants.length === 5
                ? 'Todas seleccionadas'
                : `${selectedVariants.length} seleccionada${selectedVariants.length > 1 ? 's' : ''}`}
            </label>
          </div>

          {selectedVariants.length > 0 && (
            <div className="flex items-center gap-2">
              {/* Delete button - only show if selected variants have ads */}
              {existingAds.some(ad => selectedVariants.includes(ad.variant)) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteSelectedAds}
                  disabled={deletingAds}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  {deletingAds ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4 mr-1" />
                  )}
                  Eliminar de BD ({existingAds.filter(ad => selectedVariants.includes(ad.variant)).length})
                </Button>
              )}

              {/* Update Ads button - show for variants that have existing ads with uploaded creatives */}
              {(() => {
                // Check if any selected variant has existing ads with uploaded creatives
                const selectedWithAdsAndCreatives = selectedVariants.filter(variant => {
                  const hasAd = existingAds.some(ad => ad.variant === variant)
                  const hasUploaded = creatives.some(c => c.variant === variant && c.upload_status === 'uploaded')
                  const hasLocal = localPreviews[`${variant}-4x5`] || localPreviews[`${variant}-9x16`]
                  return hasAd && (hasUploaded || hasLocal)
                })

                if (selectedWithAdsAndCreatives.length === 0) return null

                return (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleUpdateSelectedAds}
                    disabled={updatingSelectedAds}
                    className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                  >
                    {updatingSelectedAds ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-1" />
                    )}
                    Actualizar Anuncios ({selectedWithAdsAndCreatives.length})
                  </Button>
                )
              })()}

              {/* Create Ads button - show for variants that have creatives in Drive or uploaded */}
              {(() => {
                // Check if any selected variant has creatives (in Drive or uploaded to Meta)
                const selectedWithCreatives = selectedVariants.filter(variant =>
                  creatives.some(c => c.variant === variant && c.upload_status === 'uploaded') ||
                  driveCreatives.some(c => c.variant === variant)
                )
                const hasSelectedWithCreatives = selectedWithCreatives.length > 0
                const canCreate = hasSelectedWithCreatives && adSetId?.trim() && copies.length > 0

                if (!hasSelectedWithCreatives) return null

                return (
                  <Button
                    variant="default"
                    size="sm"
                    onClick={handleCreateSelectedAds}
                    disabled={creatingAds || !canCreate}
                    title={!adSetId?.trim() ? 'Falta AdSet ID' : copies.length === 0 ? 'Falta generar copies' : ''}
                  >
                    {creatingAds ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Plus className="h-4 w-4 mr-1" />
                    )}
                    Crear Anuncios ({selectedWithCreatives.length})
                  </Button>
                )
              })()}
            </div>
          )}
        </div>

        {[1, 2, 3, 4, 5].map(variant => {
          const variantCreatives = creatives.filter(c => c.variant === variant)
          const creative4x5 = variantCreatives.find(c => c.aspect_ratio === '4x5')
          const creative9x16 = variantCreatives.find(c => c.aspect_ratio === '9x16')
          // Get file IDs from driveCreatives (always has the correct fileId)
          const drive4x5 = driveCreatives.find(c => c.variant === variant && c.aspectRatio === '4x5')
          const drive9x16 = driveCreatives.find(c => c.variant === variant && c.aspectRatio === '9x16')
          const copy = copies.find(c => c.variant === variant)
          const existingAd = existingAds.find(a => a.variant === variant)
          const isUploaded = variantCreatives.some(c => c.upload_status === 'uploaded')
          // Use driveCreatives fileId if available, fallback to meta creatives drive_file_id
          const fileId4x5 = drive4x5?.fileId || creative4x5?.drive_file_id
          const fileId9x16 = drive9x16?.fileId || creative9x16?.drive_file_id
          // Local previews from manual uploads (takes priority over Drive)
          const localPreview4x5 = localPreviews[`${variant}-4x5`]
          const localPreview9x16 = localPreviews[`${variant}-9x16`]
          // Meta image URLs from API (for displaying uploaded images)
          const metaUrl4x5 = creative4x5?.meta_image_hash
            ? metaImageUrls[creative4x5.meta_image_hash]
            : creative4x5?.meta_video_id
            ? metaVideoUrls[creative4x5.meta_video_id]
            : undefined
          const metaUrl9x16 = creative9x16?.meta_image_hash
            ? metaImageUrls[creative9x16.meta_image_hash]
            : creative9x16?.meta_video_id
            ? metaVideoUrls[creative9x16.meta_video_id]
            : undefined
          const isVideo4x5 = creative4x5?.creative_type === 'VIDEO'
          const isVideo9x16 = creative9x16?.creative_type === 'VIDEO'
          const hasCreatives = drive4x5 || drive9x16 || creative4x5 || creative9x16 || localPreview4x5 || localPreview9x16
          const isSelected = selectedVariants.includes(variant)

          return (
            <div
              key={variant}
              className={`border rounded-lg p-4 transition-colors ${
                isSelected
                  ? 'border-blue-400 bg-blue-50/50 ring-1 ring-blue-400'
                  : isUploaded
                  ? 'border-green-300 bg-green-50/30'
                  : 'border-border'
              }`}
            >
              <div className="flex gap-6">
                {/* Checkbox Column */}
                <div className="flex items-start pt-1">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleVariantSelection(variant)}
                    id={`variant-${variant}`}
                  />
                </div>

                {/* META Column - Uploaded creatives with manual upload */}
                <div className="flex-shrink-0 w-[230px]">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant={isUploaded ? 'default' : 'outline'} className="text-xs">
                      V{variant}
                    </Badge>
                    <span className="text-[10px] font-medium text-blue-600">META</span>
                    {isUploaded && <Check className="h-3 w-3 text-green-500" />}
                  </div>
                  <div className="flex gap-3">
                    {/* META 4x5 */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground mb-1">4x5</span>
                      {(localPreview4x5 || creative4x5?.upload_status === 'uploaded') ? (
                        <div className="relative w-24 h-[116px] rounded-lg overflow-hidden border-2 border-blue-300 bg-muted group">
                          {localPreview4x5 ? (
                            localPreview4x5.type === 'video' ? (
                              <video src={localPreview4x5.url} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={localPreview4x5.url} alt={`V${variant} 4x5 (subido)`} className="w-full h-full object-cover" />
                            )
                          ) : metaUrl4x5 ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={metaUrl4x5} alt={`V${variant} 4x5 Meta`} className="w-full h-full object-cover" />
                              {isVideo4x5 && (
                                <div className="absolute bottom-1 left-1 bg-purple-600 rounded px-1">
                                  <span className="text-[7px] text-white font-medium">VID</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50">
                              <Check className="h-5 w-5 text-blue-500" />
                              <span className="text-[8px] text-blue-500 mt-1">Subido</span>
                            </div>
                          )}
                          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                          {/* Manual upload overlay */}
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerManualUpload(variant, '4x5') }}
                            disabled={manualUploading}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title="Reemplazar manualmente"
                          >
                            {manualUploading && manualUploadTarget?.variant === variant && manualUploadTarget?.aspectRatio === '4x5' ? (
                              <Loader2 className="h-5 w-5 text-white animate-spin" />
                            ) : (
                              <UploadCloud className="h-5 w-5 text-white" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => triggerManualUpload(variant, '4x5')}
                          disabled={manualUploading}
                          className="w-24 h-[116px] rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center justify-center transition-colors cursor-pointer"
                          title="Subir a Meta"
                        >
                          {manualUploading && manualUploadTarget?.variant === variant && manualUploadTarget?.aspectRatio === '4x5' ? (
                            <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />
                          ) : (
                            <>
                              <UploadCloud className="h-5 w-5 text-blue-400" />
                              <span className="text-[8px] text-blue-400 mt-1">Subir</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>

                    {/* META 9x16 */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground mb-1">9x16</span>
                      {(localPreview9x16 || creative9x16?.upload_status === 'uploaded') ? (
                        <div className="relative w-[68px] h-[116px] rounded-lg overflow-hidden border-2 border-blue-300 bg-muted group">
                          {localPreview9x16 ? (
                            localPreview9x16.type === 'video' ? (
                              <video src={localPreview9x16.url} className="w-full h-full object-cover" muted playsInline />
                            ) : (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={localPreview9x16.url} alt={`V${variant} 9x16 (subido)`} className="w-full h-full object-cover" />
                            )
                          ) : metaUrl9x16 ? (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={metaUrl9x16} alt={`V${variant} 9x16 Meta`} className="w-full h-full object-cover" />
                              {isVideo9x16 && (
                                <div className="absolute bottom-1 left-1 bg-purple-600 rounded px-1">
                                  <span className="text-[7px] text-white font-medium">VID</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="w-full h-full flex flex-col items-center justify-center bg-blue-50">
                              <Check className="h-5 w-5 text-blue-500" />
                              <span className="text-[8px] text-blue-500 mt-1">Subido</span>
                            </div>
                          )}
                          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); triggerManualUpload(variant, '9x16') }}
                            disabled={manualUploading}
                            className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                            title="Reemplazar manualmente"
                          >
                            {manualUploading && manualUploadTarget?.variant === variant && manualUploadTarget?.aspectRatio === '9x16' ? (
                              <Loader2 className="h-4 w-4 text-white animate-spin" />
                            ) : (
                              <UploadCloud className="h-4 w-4 text-white" />
                            )}
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => triggerManualUpload(variant, '9x16')}
                          disabled={manualUploading}
                          className="w-[68px] h-[116px] rounded-lg border-2 border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50/50 flex flex-col items-center justify-center transition-colors cursor-pointer"
                          title="Subir a Meta"
                        >
                          {manualUploading && manualUploadTarget?.variant === variant && manualUploadTarget?.aspectRatio === '9x16' ? (
                            <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />
                          ) : (
                            <>
                              <UploadCloud className="h-4 w-4 text-blue-400" />
                              <span className="text-[8px] text-blue-400 mt-1">Subir</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Ad Status & Update Button */}
                  {existingAd && (() => {
                    const statusKey = existingAd.meta_status || existingAd.status || 'DEFAULT'
                    const statusConfig = AD_STATUS_CONFIG[statusKey] || AD_STATUS_CONFIG.DEFAULT
                    const StatusIcon = statusConfig.icon
                    const hasUploadedCreatives = creatives.some(c => c.variant === variant && c.upload_status === 'uploaded') || localPreview4x5 || localPreview9x16

                    return (
                      <div className={`mt-2 px-2 py-1.5 rounded ${statusConfig.bgColor}`}>
                        <div className="flex items-center justify-between mb-0.5">
                          <div className="flex items-center gap-1 text-[10px] font-medium">
                            <StatusIcon className={`h-3 w-3 ${statusConfig.color}`} />
                            <span className={statusConfig.color}>{statusConfig.label}</span>
                          </div>
                          {hasUploadedCreatives && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleUpdateAd(variant) }}
                              disabled={updatingAdVariant === variant}
                              className="text-[9px] font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-400 flex items-center gap-0.5"
                              title="Actualizar anuncio con los creativos subidos"
                            >
                              {updatingAdVariant === variant ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                              Actualizar
                            </button>
                          )}
                        </div>
                        <span className="font-mono text-[9px] text-muted-foreground block truncate" title={existingAd.meta_ad_id}>
                          {existingAd.meta_ad_id}
                        </span>
                      </div>
                    )
                  })()}
                </div>

                {/* DRIVE Column - Original thumbnails from Drive */}
                <div className="flex-shrink-0 w-[200px]">
                  <div className="flex items-center gap-1 mb-3">
                    <span className="text-[10px] font-medium text-orange-600">DRIVE</span>
                    {(fileId4x5 || fileId9x16) && <ImageIcon className="h-3 w-3 text-orange-400" />}
                  </div>
                  <div className="flex gap-3">
                    {/* DRIVE 4x5 */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground mb-1">4x5</span>
                      {fileId4x5 ? (
                        <div className="relative w-24 h-[116px] rounded-lg overflow-hidden border-2 border-orange-200 bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://lh3.googleusercontent.com/d/${fileId4x5}=w200`}
                            alt={`V${variant} 4x5 Drive`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          {drive4x5 && (
                            <div className="absolute bottom-1 left-1 bg-orange-500 rounded px-1">
                              <span className="text-[7px] text-white">{creative4x5?.creative_type === 'VIDEO' ? 'VID' : 'IMG'}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-24 h-[116px] rounded-lg border-2 border-dashed border-orange-200 flex flex-col items-center justify-center bg-orange-50/30">
                          <ImageIcon className="h-5 w-5 text-orange-300" />
                          <span className="text-[8px] text-orange-300 mt-1">Sin archivo</span>
                        </div>
                      )}
                    </div>

                    {/* DRIVE 9x16 */}
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] text-muted-foreground mb-1">9x16</span>
                      {fileId9x16 ? (
                        <div className="relative w-[68px] h-[116px] rounded-lg overflow-hidden border-2 border-orange-200 bg-muted">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={`https://lh3.googleusercontent.com/d/${fileId9x16}=w200`}
                            alt={`V${variant} 9x16 Drive`}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            referrerPolicy="no-referrer"
                          />
                          {drive9x16 && (
                            <div className="absolute bottom-1 left-1 bg-orange-500 rounded px-1">
                              <span className="text-[7px] text-white">{creative9x16?.creative_type === 'VIDEO' ? 'VID' : 'IMG'}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-[68px] h-[116px] rounded-lg border-2 border-dashed border-orange-200 flex flex-col items-center justify-center bg-orange-50/30">
                          <ImageIcon className="h-4 w-4 text-orange-300" />
                          <span className="text-[8px] text-orange-300 mt-1">Sin archivo</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Copy Column */}
                <div className="flex-1 min-w-0">
                  {copy ? (
                    editingCopy === variant ? (
                      <div className="space-y-3">
                        <div>
                          <Label className="text-sm font-medium">Headline (max 40)</Label>
                          <Input
                            value={copy.headline}
                            onChange={e => updateCopyField(variant, 'headline', e.target.value)}
                            maxLength={40}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Texto principal</Label>
                          <Textarea
                            value={copy.primary_text}
                            onChange={e => updateCopyField(variant, 'primary_text', e.target.value)}
                            rows={4}
                            className="mt-1"
                          />
                        </div>
                        <div>
                          <Label className="text-sm font-medium">Descripción</Label>
                          <Input
                            value={copy.description || ''}
                            onChange={e => updateCopyField(variant, 'description', e.target.value)}
                            maxLength={125}
                            className="mt-1"
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleSaveCopy(copy)}
                            disabled={savingCopy === variant}
                          >
                            {savingCopy === variant ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            ) : (
                              <Save className="h-4 w-4 mr-1" />
                            )}
                            Guardar
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => setEditingCopy(null)}>
                            Cancelar
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div
                        className="cursor-pointer hover:bg-muted/30 rounded-lg p-2 -m-2 transition-colors h-full"
                        onClick={() => setEditingCopy(variant)}
                      >
                        <p className="font-semibold text-base mb-1">{copy.headline}</p>
                        <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                          {copy.primary_text}
                        </p>
                        {copy.description && (
                          <p className="text-sm text-muted-foreground mt-2 italic">
                            {copy.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2 opacity-50">
                          Click para editar
                        </p>
                      </div>
                    )
                  ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                      Sin copy - Genera copies para esta variante
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>


      {/* Progress */}
      {creationProgress.length > 0 && (
        <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
          {creationProgress.map((msg, i) => (
            <p key={i} className="text-muted-foreground">{msg}</p>
          ))}
        </div>
      )}
    </div>
  )
}
