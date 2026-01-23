'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Loader2, Upload, X, Check, ExternalLink, Trash2, Play, FolderOpen } from 'lucide-react'
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

type FoldersInfo = {
  packageFolderId: string | null
  variantFolders: Record<number, string>
}

interface DesignModalProps {
  packageId: number
  packageTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

const VARIANTS = [1, 2, 3, 4, 5]
const VARIANT_LABELS: Record<number, string> = {
  1: 'Precio/Oferta',
  2: 'Experiencia',
  3: 'Destino',
  4: 'Conveniencia',
  5: 'Escasez',
}
const ASPECT_RATIOS: { key: AspectRatio; label: string }[] = [
  { key: '4x5', label: '4:5' },
  { key: '9x16', label: '9:16' },
]

export function DesignModal({ packageId, packageTitle, open, onOpenChange }: DesignModalProps) {
  const [creatives, setCreatives] = useState<Record<number, VariantCreatives>>({})
  const [folders, setFolders] = useState<FoldersInfo>({ packageFolderId: null, variantFolders: {} })
  const [isLoading, setIsLoading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<Record<string, PendingFile>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, UploadProgress>>({})
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const loadCreatives = useCallback(async () => {
    if (!packageId) return

    setIsLoading(true)
    try {
      const response = await fetch(`/api/creatives/${packageId}`)
      const data = await response.json()

      if (data.creatives) {
        const grouped: Record<number, VariantCreatives> = {}
        for (const creative of data.creatives as Creative[]) {
          if (!grouped[creative.variant]) {
            grouped[creative.variant] = {}
          }
          grouped[creative.variant][creative.aspectRatio] = creative
        }
        setCreatives(grouped)
      }

      if (data.folders) {
        setFolders(data.folders)
      }
    } catch (error) {
      console.error('Error loading creatives:', error)
    } finally {
      setIsLoading(false)
    }
  }, [packageId])

  useEffect(() => {
    if (open) {
      loadCreatives()
      setPendingFiles({})
      setUploadProgress({})
    }
  }, [open, loadCreatives])

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
    const total = VARIANTS.length * ASPECT_RATIOS.length

    for (const variant of VARIANTS) {
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

  const renderSlot = (variant: number, ar: { key: AspectRatio; label: string }) => {
    const creative = creatives[variant]?.[ar.key]
    const slotKey = `${variant}-${ar.key}`
    const pending = pendingFiles[slotKey]
    const progress = uploadProgress[slotKey]

    // Size classes based on aspect ratio
    const sizeClass = ar.key === '4x5' ? 'w-[100px] h-[100px]' : 'w-[100px] h-[160px]'

    if (creative && !pending) {
      // Google Drive thumbnail URL (works for publicly shared files)
      const thumbnailUrl = `https://drive.google.com/thumbnail?id=${creative.fileId}&sz=w150`

      return (
        <div className={`relative group ${sizeClass} border rounded-lg overflow-hidden bg-gray-100`}>
          <img
            src={thumbnailUrl}
            alt={`${ar.label} preview`}
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          {/* Green checkmark badge */}
          <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
            <Check className="h-3 w-3 text-white" />
          </div>
          {/* Hover overlay with actions */}
          <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
            <a
              href={creative.webViewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 bg-white rounded hover:bg-gray-100"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
            <button
              onClick={() => handleDelete(variant, ar.key, creative.fileId)}
              className="p-1.5 bg-white rounded hover:bg-gray-100 text-red-500"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )
    }

    if (pending) {
      return (
        <div className={`relative ${sizeClass} border rounded-lg overflow-hidden bg-gray-100`}>
          {pending.isVideo ? (
            <div className="w-full h-full bg-gray-900 flex items-center justify-center relative">
              <video src={pending.preview} className="w-full h-full object-cover" muted />
              <Play className="absolute h-6 w-6 text-white" />
            </div>
          ) : (
            <img src={pending.preview} alt="Preview" className="w-full h-full object-cover" />
          )}

          {progress && progress.status === 'uploading' && (
            <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
              <Progress value={progress.progress} className="w-12 h-1.5" />
              <span className="text-white text-xs mt-1">{progress.progress}%</span>
            </div>
          )}

          {progress && progress.status === 'done' && (
            <div className="absolute inset-0 bg-green-500/60 flex items-center justify-center">
              <Check className="h-8 w-8 text-white" />
            </div>
          )}

          {progress && progress.status === 'error' && (
            <div className="absolute inset-0 bg-red-500/60 flex items-center justify-center">
              <X className="h-8 w-8 text-white" />
            </div>
          )}

          {(!progress || progress.status !== 'uploading') && (
            <button
              onClick={() => removePendingFile(slotKey)}
              className="absolute -top-1 -right-1 p-0.5 bg-red-500 rounded-full text-white hover:bg-red-600 z-10"
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
        <Upload className="h-6 w-6 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground mt-1">{ar.label}</span>
      </label>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[1000px] sm:max-w-[1000px] bg-gray-100 p-0 overflow-hidden">
        <DialogHeader className="bg-white px-6 py-4 border-b">
          <DialogTitle className="flex items-center justify-between text-base">
            <div className="flex items-center gap-2 min-w-0">
              <span className="truncate max-w-[500px]">{packageTitle}</span>
              {folders.packageFolderId && (
                <a
                  href={`https://drive.google.com/drive/folders/${folders.packageFolderId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
                >
                  <FolderOpen className="h-3.5 w-3.5" />
                  Ver carpeta
                </a>
              )}
            </div>
            <span className="text-sm font-normal text-muted-foreground ml-4">
              {completed}/{total}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4">
          {isLoading && (
            <div className="flex items-center justify-center py-2 mb-2">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mr-2" />
              <span className="text-xs text-muted-foreground">Cargando...</span>
            </div>
          )}

          {/* Horizontal layout: all variants side by side */}
          <div className="flex gap-4 justify-center">
            {VARIANTS.map((variant) => (
              <div key={variant} className="flex flex-col items-center gap-2">
                <div className="text-center">
                  <span className="text-sm font-medium text-muted-foreground">V{variant}</span>
                  <p className="text-[10px] text-muted-foreground/70">{VARIANT_LABELS[variant]}</p>
                  {folders.variantFolders[variant] && (
                    <a
                      href={`https://drive.google.com/drive/folders/${folders.variantFolders[variant]}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-[10px] text-primary hover:underline mt-0.5"
                    >
                      <FolderOpen className="h-3 w-3" />
                      Ver carpeta
                    </a>
                  )}
                </div>
                <div className="flex flex-col gap-3">
                  {ASPECT_RATIOS.map((ar) => (
                    <div key={ar.key}>
                      {renderSlot(variant, ar)}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex justify-center gap-4 mt-4 text-[10px] text-muted-foreground">
            <span>Superior: 4:5</span>
            <span>Inferior: 9:16</span>
          </div>

          {/* Actions */}
          <div className="flex justify-between items-center mt-4 border-t bg-white -mx-6 -mb-4 px-6 py-4">
            <div className="text-sm text-muted-foreground">
              {pendingCount > 0 && (
                <span className="text-primary font-medium">
                  {pendingCount} listo{pendingCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
              {pendingCount > 0 && (
                <Button
                  size="sm"
                  onClick={handleUploadAll}
                  disabled={isUploading}
                  className="gap-1"
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      Subiendo...
                    </>
                  ) : (
                    <>
                      <Upload className="h-3 w-3" />
                      SUBIR ({pendingCount})
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
