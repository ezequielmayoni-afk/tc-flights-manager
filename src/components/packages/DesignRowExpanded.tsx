'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, X, Check, ExternalLink, Trash2, Play, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

type AspectRatio = '4x5' | '9x16'

type Creative = {
  variant: number
  aspectRatio: AspectRatio
  fileId: string
  webViewLink: string
}

type VariantCreatives = {
  '4x5'?: Creative
  '9x16'?: Creative
}

type PendingFile = {
  file: File
  preview: string
  isVideo: boolean
}

type UploadProgress = {
  progress: number
  status: 'uploading' | 'done' | 'error'
}

interface DesignRowExpandedProps {
  packageId: number
  tcPackageId: number
  requestedVariants?: number[]
  onCreativesChange?: (count: number) => void
}

const VARIANTS = [1, 2, 3, 4, 5]
const ASPECT_RATIOS: { key: AspectRatio; label: string }[] = [
  { key: '4x5', label: '4:5' },
  { key: '9x16', label: '9:16' },
]

export function DesignRowExpanded({ packageId, tcPackageId, requestedVariants, onCreativesChange }: DesignRowExpandedProps) {
  // Use requested variants if provided, otherwise show all
  const displayVariants = requestedVariants && requestedVariants.length > 0 ? requestedVariants.sort((a, b) => a - b) : VARIANTS
  const [creatives, setCreatives] = useState<Record<number, VariantCreatives>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingFile>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({})
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const onCreativesChangeRef = useRef(onCreativesChange)

  // Keep ref updated
  useEffect(() => {
    onCreativesChangeRef.current = onCreativesChange
  }, [onCreativesChange])

  const loadCreatives = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const response = await fetch(`/api/creatives/${packageId}`)
      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || `Error ${response.status}`)
      }

      const grouped: Record<number, VariantCreatives> = {}
      if (data.creatives && Array.isArray(data.creatives)) {
        for (const creative of data.creatives as Creative[]) {
          if (!grouped[creative.variant]) {
            grouped[creative.variant] = {}
          }
          grouped[creative.variant][creative.aspectRatio] = creative
        }
      }
      setCreatives(grouped)

      // Notify parent of creative count
      if (onCreativesChangeRef.current) {
        onCreativesChangeRef.current(data.creatives?.length || 0)
      }
    } catch (error) {
      console.error('Error loading creatives:', error)
      setLoadError(error instanceof Error ? error.message : 'Error al cargar')
      setCreatives({})
      // Still notify parent with 0
      if (onCreativesChangeRef.current) {
        onCreativesChangeRef.current(0)
      }
    } finally {
      setIsLoading(false)
    }
  }, [packageId])

  useEffect(() => {
    loadCreatives()
  }, [loadCreatives])

  useEffect(() => {
    return () => {
      Object.values(pendingFiles).forEach(pf => {
        URL.revokeObjectURL(pf.preview)
      })
    }
  }, [pendingFiles])

  const handleFileSelect = (variant: number, aspectRatio: AspectRatio) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const slotKey = `${variant}-${aspectRatio}`
    const isVideo = file.type.startsWith('video/')
    const preview = URL.createObjectURL(file)

    if (pendingFiles[slotKey]) {
      URL.revokeObjectURL(pendingFiles[slotKey].preview)
    }

    setPendingFiles(prev => ({
      ...prev,
      [slotKey]: { file, preview, isVideo }
    }))

    setUploadProgress(prev => {
      const updated = { ...prev }
      delete updated[slotKey]
      return updated
    })

    e.target.value = ''
  }

  const removePendingFile = (slotKey: string) => {
    if (pendingFiles[slotKey]) {
      URL.revokeObjectURL(pendingFiles[slotKey].preview)
    }
    setPendingFiles(prev => {
      const updated = { ...prev }
      delete updated[slotKey]
      return updated
    })
  }

  const uploadFile = async (slotKey: string, variant: number, aspectRatio: AspectRatio, file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const progress = Math.round((e.loaded / e.total) * 100)
          setUploadProgress(prev => ({
            ...prev,
            [slotKey]: { progress, status: 'uploading' }
          }))
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText)
            setCreatives(prev => ({
              ...prev,
              [variant]: {
                ...prev[variant],
                [aspectRatio]: {
                  variant,
                  aspectRatio,
                  fileId: data.fileId,
                  webViewLink: data.webViewLink,
                },
              },
            }))
            setUploadProgress(prev => ({
              ...prev,
              [slotKey]: { progress: 100, status: 'done' }
            }))
            resolve(true)
          } catch {
            setUploadProgress(prev => ({
              ...prev,
              [slotKey]: { progress: 0, status: 'error' }
            }))
            resolve(false)
          }
        } else {
          setUploadProgress(prev => ({
            ...prev,
            [slotKey]: { progress: 0, status: 'error' }
          }))
          resolve(false)
        }
      })

      xhr.addEventListener('error', () => {
        setUploadProgress(prev => ({
          ...prev,
          [slotKey]: { progress: 0, status: 'error' }
        }))
        resolve(false)
      })

      const formData = new FormData()
      formData.append('packageId', String(packageId))
      formData.append('variant', String(variant))
      formData.append('aspectRatio', aspectRatio)
      formData.append('file', file)

      xhr.open('POST', '/api/creatives/upload')
      xhr.send(formData)
    })
  }

  const handleUploadAll = async () => {
    const entries = Object.entries(pendingFiles)
    if (entries.length === 0) return

    setIsUploading(true)
    let successCount = 0
    let errorCount = 0

    for (const [slotKey, { file }] of entries) {
      const [variantStr, aspectRatio] = slotKey.split('-')
      const variant = parseInt(variantStr, 10)

      const success = await uploadFile(slotKey, variant, aspectRatio as AspectRatio, file)
      if (success) {
        successCount++
        if (pendingFiles[slotKey]) {
          URL.revokeObjectURL(pendingFiles[slotKey].preview)
        }
        setPendingFiles(prev => {
          const updated = { ...prev }
          delete updated[slotKey]
          return updated
        })
      } else {
        errorCount++
      }
    }

    setIsUploading(false)

    if (successCount > 0) {
      toast.success(`${successCount} archivo${successCount > 1 ? 's' : ''} subido${successCount > 1 ? 's' : ''} correctamente`)
      // Reload to get updated count
      loadCreatives()
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} archivo${errorCount > 1 ? 's' : ''} fallaron al subir`)
    }
  }

  const handleDelete = async (variant: number, aspectRatio: AspectRatio, fileId: string) => {
    try {
      const response = await fetch(`/api/creatives/${packageId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId }),
      })

      if (!response.ok) {
        throw new Error('Error al eliminar')
      }

      setCreatives(prev => {
        const updated = { ...prev }
        if (updated[variant]) {
          delete updated[variant][aspectRatio]
        }
        return updated
      })

      toast.success('Creativo eliminado')
      loadCreatives() // Reload to update count
    } catch {
      toast.error('Error al eliminar creativo')
    }
  }

  const handleDrop = (variant: number, aspectRatio: AspectRatio) => (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file && (file.type.startsWith('image/') || file.type.startsWith('video/'))) {
      const slotKey = `${variant}-${aspectRatio}`
      const isVideo = file.type.startsWith('video/')
      const preview = URL.createObjectURL(file)

      if (pendingFiles[slotKey]) {
        URL.revokeObjectURL(pendingFiles[slotKey].preview)
      }

      setPendingFiles(prev => ({
        ...prev,
        [slotKey]: { file, preview, isVideo }
      }))
    }
  }

  const getCompletionCount = () => {
    let completed = 0
    const total = displayVariants.length * ASPECT_RATIOS.length

    for (const variant of displayVariants) {
      for (const ar of ASPECT_RATIOS) {
        if (creatives[variant]?.[ar.key]) {
          completed++
        }
      }
    }

    return { completed, total }
  }

  const pendingCount = Object.keys(pendingFiles).length
  const { completed, total } = getCompletionCount()

  // Render existing creative thumbnail (left side - current)
  const renderExistingSlot = (variant: number, ar: { key: AspectRatio; label: string }) => {
    const creative = creatives[variant]?.[ar.key]
    const sizeClass = ar.key === '4x5' ? 'w-[70px] h-[70px]' : 'w-[70px] h-[112px]'

    if (creative) {
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${creative.fileId}&sz=w150`
      return (
        <div className={`relative group ${sizeClass} border rounded-lg overflow-hidden bg-gray-100`}>
          <img
            src={thumbnailUrl}
            alt={`${ar.label} actual`}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
            loading="lazy"
          />
          <div className="absolute top-0.5 right-0.5 bg-green-500 rounded-full p-0.5">
            <Check className="h-2 w-2 text-white" />
          </div>
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <a
              href={creative.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1 bg-white rounded hover:bg-gray-100"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      )
    }

    // Empty slot - no existing creative
    return (
      <div className={`${sizeClass} border rounded-lg bg-gray-100 flex items-center justify-center`}>
        <span className="text-[9px] text-muted-foreground">Sin archivo</span>
      </div>
    )
  }

  // Render upload slot (right side - new)
  const renderUploadSlot = (variant: number, ar: { key: AspectRatio; label: string }) => {
    const slotKey = `${variant}-${ar.key}`
    const pending = pendingFiles[slotKey]
    const progress = uploadProgress[slotKey]
    const sizeClass = ar.key === '4x5' ? 'w-[70px] h-[70px]' : 'w-[70px] h-[112px]'

    if (pending) {
      return (
        <div className={`relative ${sizeClass} border-2 border-green-500 rounded-lg overflow-hidden bg-gray-100`}>
          {pending.isVideo ? (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center relative">
              <video src={pending.preview} className="w-full h-full object-cover" muted />
              <Play className="absolute h-4 w-4 text-white" />
            </div>
          ) : (
            <img src={pending.preview} alt="Preview" className="w-full h-full object-cover" />
          )}

          {progress && progress.status === 'uploading' && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <Progress value={progress.progress} className="w-10 h-1" />
              <span className="text-white text-[9px] mt-1">{progress.progress}%</span>
            </div>
          )}

          {progress && progress.status === 'done' && (
            <div className="absolute inset-0 bg-green-500/60 flex items-center justify-center">
              <Check className="h-5 w-5 text-white" />
            </div>
          )}

          {progress && progress.status === 'error' && (
            <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
              <X className="h-5 w-5 text-white" />
            </div>
          )}

          {/* Delete button - always visible when not uploading */}
          {(!progress || progress.status !== 'uploading') && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                removePendingFile(slotKey)
              }}
              className="absolute top-1 right-1 p-1 bg-red-500 rounded-full text-white hover:bg-red-600 z-10 shadow-md"
              title="Eliminar archivo"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )
    }

    return (
      <label
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop(variant, ar.key)}
        className={`${sizeClass} border-2 border-dashed rounded-lg cursor-pointer flex flex-col items-center justify-center hover:border-primary hover:bg-white transition-colors border-gray-300 bg-white`}
      >
        <input
          ref={(el) => { fileInputRefs.current[slotKey] = el }}
          type="file"
          accept="image/*,video/*"
          className="hidden"
          onChange={handleFileSelect(variant, ar.key)}
        />
        <Upload className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[9px] font-medium text-muted-foreground mt-0.5">{ar.label}</span>
      </label>
    )
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
        <span className="text-sm text-muted-foreground">Cargando creativos...</span>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-6 flex flex-col items-center justify-center gap-3">
        <span className="text-sm text-red-600">{loadError}</span>
        <Button
          variant="outline"
          size="sm"
          onClick={loadCreatives}
          className="gap-1"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="p-4 bg-gray-50">
      {/* Header with count and actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium">Creativos</span>
          <span className={`text-sm ${completed === total ? 'text-green-600' : 'text-amber-600'}`}>
            {completed}/{total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadCreatives}
            className="h-7 px-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {pendingCount > 0 && (
          <Button
            size="sm"
            onClick={handleUploadAll}
            disabled={isUploading}
            className="gap-1 h-8"
          >
            {isUploading ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                Subiendo...
              </>
            ) : (
              <>
                <Upload className="h-3 w-3" />
                Actualizar ({pendingCount})
              </>
            )}
          </Button>
        )}
      </div>

      {/* Dual panel layout: Current (left) vs New (right) */}
      <div className="flex gap-8 justify-center">
        {/* LEFT PANEL - Current/Existing creatives */}
        <div className="flex flex-col">
          <div className="text-center mb-2">
            <span className="text-xs font-medium text-muted-foreground bg-gray-200 px-2 py-0.5 rounded">
              ACTUAL
            </span>
          </div>
          <div className="flex gap-3">
            {displayVariants.map((variant) => (
              <div key={variant} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">V{variant}</span>
                <div className="flex flex-col gap-1.5">
                  {ASPECT_RATIOS.map((ar) => (
                    <div key={ar.key}>
                      {renderExistingSlot(variant, ar)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Arrow separator */}
        <div className="flex items-center justify-center">
          <div className="text-muted-foreground text-2xl">→</div>
        </div>

        {/* RIGHT PANEL - New/Upload slots */}
        <div className="flex flex-col">
          <div className="text-center mb-2">
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
              NUEVO
            </span>
          </div>
          <div className="flex gap-3">
            {displayVariants.map((variant) => (
              <div key={variant} className="flex flex-col items-center gap-1.5">
                <span className="text-[10px] font-medium text-muted-foreground">V{variant}</span>
                <div className="flex flex-col gap-1.5">
                  {ASPECT_RATIOS.map((ar) => (
                    <div key={ar.key}>
                      {renderUploadSlot(variant, ar)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-4 mt-3 text-[10px] text-muted-foreground">
        <span>Superior: 4:5 (Feed/Stories)</span>
        <span>Inferior: 9:16 (Reels)</span>
      </div>
    </div>
  )
}
