'use client'

import { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import {
  Loader2,
  Sparkles,
  Upload,
  Image as ImageIcon,
  Video,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react'

interface MetaCreative {
  id: number
  variant: number
  aspect_ratio: string
  meta_image_hash: string
  drive_file_id: string
  upload_status: string
}

interface DriveCreative {
  variant: number
  aspectRatio: string
  fileId: string
  webViewLink: string
}

interface Copy {
  id: number
  variant: number
  headline: string
  primary_text: string
}

interface UploadToMetaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  packageId: number
  tcPackageId: number
  packageTitle: string
  onComplete: () => void
}

export function UploadToMetaModal({
  open,
  onOpenChange,
  packageId,
  tcPackageId,
  packageTitle,
  onComplete,
}: UploadToMetaModalProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isRegenerating, setIsRegenerating] = useState(false)

  // Data
  const [metaCreatives, setMetaCreatives] = useState<MetaCreative[]>([])
  const [driveCreatives, setDriveCreatives] = useState<DriveCreative[]>([])
  const [copies, setCopies] = useState<Copy[]>([])
  const [metaImageUrls, setMetaImageUrls] = useState<Record<string, string>>({})
  const [progress, setProgress] = useState<string[]>([])

  // Expanded state
  const [expandedVariant, setExpandedVariant] = useState<number | null>(null)

  useEffect(() => {
    if (open) {
      loadData()
    } else {
      setMetaCreatives([])
      setDriveCreatives([])
      setCopies([])
      setMetaImageUrls({})
      setProgress([])
      setExpandedVariant(null)
      setIsLoading(true)
    }
  }, [open, packageId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [metaRes, driveRes, copiesRes] = await Promise.all([
        fetch(`/api/meta/creatives/${packageId}`),
        fetch(`/api/creatives/${packageId}`),
        fetch(`/api/meta/copy/${packageId}`),
      ])

      let metaData: MetaCreative[] = []
      if (metaRes.ok) {
        const data = await metaRes.json()
        metaData = data.creatives || []
        setMetaCreatives(metaData)
      }

      if (driveRes.ok) {
        const data = await driveRes.json()
        setDriveCreatives(data.creatives || [])
      }

      if (copiesRes.ok) {
        const data = await copiesRes.json()
        setCopies(data.copies || [])
      }

      const hashes = metaData
        .filter(c => c.meta_image_hash)
        .map(c => c.meta_image_hash)

      if (hashes.length > 0) {
        const imageUrlsRes = await fetch('/api/meta/images', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hashes }),
        })
        if (imageUrlsRes.ok) {
          const { urls } = await imageUrlsRes.json()
          setMetaImageUrls(urls || {})
        }
      }
    } catch (error) {
      console.error('Error loading data:', error)
      toast.error('Error cargando datos')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRegenerateCopies = async () => {
    setIsRegenerating(true)
    try {
      const res = await fetch('/api/meta/copy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      })

      if (!res.ok) throw new Error('Error generando copies')

      toast.success('Copies regenerados')
      const copiesRes = await fetch(`/api/meta/copy/${packageId}`)
      if (copiesRes.ok) {
        const data = await copiesRes.json()
        setCopies(data.copies || [])
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleUpdate = async () => {
    if (driveCreatives.length === 0) {
      toast.error('No hay creativos nuevos en Drive')
      return
    }

    setIsUpdating(true)
    setProgress(['Iniciando actualización...'])

    try {
      setProgress(prev => [...prev, 'Subiendo creativos nuevos a Meta...'])

      const uploadRes = await fetch('/api/meta/creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: [packageId] }),
      })

      if (uploadRes.headers.get('content-type')?.includes('text/event-stream')) {
        await readSSEStream(uploadRes, 'upload')
      } else if (!uploadRes.ok) {
        throw new Error('Error subiendo creativos')
      }

      setProgress(prev => [...prev, 'Actualizando anuncios en Meta...'])

      const updateRes = await fetch('/api/meta/ads/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId }),
      })

      if (updateRes.headers.get('content-type')?.includes('text/event-stream')) {
        await readSSEStream(updateRes, 'update')
      } else if (updateRes.ok) {
        const data = await updateRes.json()
        setProgress(prev => [...prev, `Actualización completada: ${data.updated || 0} anuncios`])
      } else {
        throw new Error('Error actualizando anuncios')
      }

      toast.success('Anuncios actualizados correctamente')
      onComplete()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error')
      setProgress(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`])
    } finally {
      setIsUpdating(false)
    }
  }

  const readSSEStream = async (res: Response, type: 'upload' | 'update') => {
    const reader = res.body?.getReader()
    const decoder = new TextDecoder()

    if (reader) {
      let done = false
      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          const text = decoder.decode(value)
          const lines = text.split('\n').filter(l => l.startsWith('data: '))
          for (const line of lines) {
            try {
              const data = JSON.parse(line.replace('data: ', ''))
              if (data.type === 'progress' || data.type === 'updating' || data.type === 'uploading') {
                const msg = data.data.step || data.data.status || `V${data.data.variant}`
                setProgress(prev => [...prev, msg])
              } else if (data.type === 'complete') {
                const count = data.data.updated || data.data.uploaded || 0
                setProgress(prev => [...prev, `${type === 'upload' ? 'Subidos' : 'Actualizados'}: ${count}`])
              } else if (data.type === 'error') {
                setProgress(prev => [...prev, `Error: ${data.data.error}`])
              }
            } catch { /* ignore */ }
          }
        }
      }
    }
  }

  const groupByVariant = <T extends { variant: number }>(items: T[]) => {
    const grouped = new Map<number, T[]>()
    for (const item of items) {
      const existing = grouped.get(item.variant) || []
      existing.push(item)
      grouped.set(item.variant, existing)
    }
    return grouped
  }

  const metaByVariant = groupByVariant(metaCreatives)

  const getDriveThumbnail = (fileId: string) =>
    `https://drive.google.com/thumbnail?id=${fileId}&sz=w200`

  const getMetaThumbnail = (hash: string) =>
    metaImageUrls[hash] || ''

  const variants = [1, 2, 3, 4, 5]

  // Summary counts
  const metaCount = metaCreatives.length
  const driveCount = driveCreatives.length
  const copiesCount = copies.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[900px] max-w-[900px] p-0">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle className="text-lg">Actualizar Anuncios</DialogTitle>
          <DialogDescription className="text-sm">
            {packageTitle} <span className="font-mono text-muted-foreground">({tcPackageId})</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : isUpdating ? (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium">Actualizando...</span>
            </div>
            <div className="bg-muted rounded p-3 max-h-[300px] overflow-y-auto font-mono text-xs space-y-0.5">
              {progress.map((msg, i) => (
                <p key={i} className="text-muted-foreground">{msg}</p>
              ))}
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {/* Summary Header */}
            <div className="px-4 py-3 bg-muted/30 flex items-center justify-between">
              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                    En Meta
                  </Badge>
                  <span className="text-muted-foreground">{metaCount} creativos</span>
                </div>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Nuevo
                  </Badge>
                  <span className="text-muted-foreground">{driveCount} creativos</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{copiesCount} copies</Badge>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRegenerateCopies}
                  disabled={isRegenerating}
                  className="h-7 px-2"
                >
                  {isRegenerating ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                </Button>
              </div>
            </div>

            {/* Variant Rows */}
            {variants.map(variant => {
              const metaItems = metaByVariant.get(variant) || []
              const meta4x5 = metaItems.find(c => c.aspect_ratio === '4x5')
              const meta9x16 = metaItems.find(c => c.aspect_ratio === '9x16')

              const driveItems = driveCreatives.filter(c => c.variant === variant)
              const drive4x5 = driveItems.find(c => c.aspectRatio === '4x5')
              const drive9x16 = driveItems.find(c => c.aspectRatio === '9x16')

              const copy = copies.find(c => c.variant === variant)
              const isExpanded = expandedVariant === variant

              const hasMeta = meta4x5 || meta9x16
              const hasDrive = drive4x5 || drive9x16

              return (
                <div key={variant}>
                  {/* Collapsed Row */}
                  <div
                    className={`px-4 py-3 flex items-center gap-4 cursor-pointer hover:bg-muted/30 transition-colors ${isExpanded ? 'bg-muted/20' : ''}`}
                    onClick={() => setExpandedVariant(isExpanded ? null : variant)}
                  >
                    {/* Variant Label */}
                    <div className="w-10 text-sm font-semibold text-muted-foreground">V{variant}</div>

                    {/* Meta Creatives */}
                    <div className="flex items-center gap-2 w-[140px]">
                      <div className="w-10 h-12 bg-gray-100 rounded overflow-hidden flex items-center justify-center shrink-0 border">
                        {meta4x5?.meta_image_hash && getMetaThumbnail(meta4x5.meta_image_hash) ? (
                          <img src={getMetaThumbnail(meta4x5.meta_image_hash)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                      <div className="w-7 h-12 bg-gray-100 rounded overflow-hidden flex items-center justify-center shrink-0 border">
                        {meta9x16?.meta_image_hash && getMetaThumbnail(meta9x16.meta_image_hash) ? (
                          <img src={getMetaThumbnail(meta9x16.meta_image_hash)} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Video className="h-3 w-3 text-gray-300" />
                        )}
                      </div>
                      {hasMeta && (
                        <Check className="h-4 w-4 text-blue-600" />
                      )}
                    </div>

                    {/* Arrow */}
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />

                    {/* Drive Creatives */}
                    <div className="flex items-center gap-2 w-[140px]">
                      <div className="w-10 h-12 bg-green-50 rounded overflow-hidden flex items-center justify-center shrink-0 border border-green-200">
                        {drive4x5?.fileId ? (
                          <img src={getDriveThumbnail(drive4x5.fileId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <ImageIcon className="h-4 w-4 text-gray-300" />
                        )}
                      </div>
                      <div className="w-7 h-12 bg-green-50 rounded overflow-hidden flex items-center justify-center shrink-0 border border-green-200">
                        {drive9x16?.fileId ? (
                          <img src={getDriveThumbnail(drive9x16.fileId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <Video className="h-3 w-3 text-gray-300" />
                        )}
                      </div>
                      {hasDrive && (
                        <Check className="h-4 w-4 text-green-600" />
                      )}
                    </div>

                    {/* Copy Preview */}
                    <div className="flex-1 min-w-0">
                      {copy ? (
                        <p className="text-sm truncate">{copy.headline}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">Sin copy</p>
                      )}
                    </div>

                    {/* Expand Button */}
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <div className="px-4 py-4 bg-muted/10 border-t">
                      <div className="grid grid-cols-2 gap-6">
                        {/* Meta Section */}
                        <div>
                          <p className="text-xs font-medium text-blue-700 mb-2">En Meta (actual)</p>
                          <div className="flex gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">4x5</p>
                              <div className="w-24 aspect-[4/5] bg-gray-100 rounded-lg overflow-hidden border">
                                {meta4x5?.meta_image_hash && getMetaThumbnail(meta4x5.meta_image_hash) ? (
                                  <img src={getMetaThumbnail(meta4x5.meta_image_hash)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-gray-300" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">9x16</p>
                              <div className="w-16 aspect-[9/16] bg-gray-100 rounded-lg overflow-hidden border">
                                {meta9x16?.meta_image_hash && getMetaThumbnail(meta9x16.meta_image_hash) ? (
                                  <img src={getMetaThumbnail(meta9x16.meta_image_hash)} alt="" className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Video className="h-5 w-5 text-gray-300" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Drive Section */}
                        <div>
                          <p className="text-xs font-medium text-green-700 mb-2">Nuevo (Drive)</p>
                          <div className="flex gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">4x5</p>
                              <div className="w-24 aspect-[4/5] bg-green-50 rounded-lg overflow-hidden border border-green-200">
                                {drive4x5?.fileId ? (
                                  <img src={getDriveThumbnail(drive4x5.fileId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <ImageIcon className="h-6 w-6 text-gray-300" />
                                  </div>
                                )}
                              </div>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground mb-1">9x16</p>
                              <div className="w-16 aspect-[9/16] bg-green-50 rounded-lg overflow-hidden border border-green-200">
                                {drive9x16?.fileId ? (
                                  <img src={getDriveThumbnail(drive9x16.fileId)} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center">
                                    <Video className="h-5 w-5 text-gray-300" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Copy Detail */}
                      {copy && (
                        <div className="mt-4 pt-4 border-t">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Copy V{variant}</p>
                          <p className="font-semibold text-sm">{copy.headline}</p>
                          <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{copy.primary_text}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Footer */}
        {!isLoading && !isUpdating && (
          <div className="p-4 border-t flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleUpdate}
              disabled={driveCreatives.length === 0}
              className="gap-1"
            >
              <Upload className="h-3 w-3" />
              Actualizar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
