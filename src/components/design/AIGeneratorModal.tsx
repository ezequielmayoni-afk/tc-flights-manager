'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Sparkles,
  Copy,
  Check,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
  Type,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PackageAICreative } from '@/types/ai-creatives'

interface AIGeneratorModalProps {
  packageId: number
  packageTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GenerationStatus = 'idle' | 'loading' | 'generating-text' | 'generating-images' | 'done' | 'error'

export function AIGeneratorModal({
  packageId,
  packageTitle,
  open,
  onOpenChange,
}: AIGeneratorModalProps) {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [creatives, setCreatives] = useState<PackageAICreative[]>([])
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [generateImages, setGenerateImages] = useState(false) // Default: only text

  // Load existing creatives
  const loadCreatives = useCallback(async () => {
    if (!packageId) return

    setStatus('loading')
    try {
      const response = await fetch(`/api/ai/generate-creatives?packageId=${packageId}`)
      const data = await response.json()

      if (data.creatives && data.creatives.length > 0) {
        setCreatives(data.creatives)
        setStatus('done')
      } else {
        setStatus('idle')
      }
    } catch (err) {
      console.error('Error loading AI creatives:', err)
      setStatus('idle')
    }
  }, [packageId])

  useEffect(() => {
    if (open) {
      loadCreatives()
      setError(null)
    }
  }, [open, loadCreatives])

  // Generate new creatives
  const handleGenerate = async () => {
    setStatus('generating-text')
    setError(null)

    try {
      const response = await fetch('/api/ai/generate-creatives', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          generateImages,
        }),
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to generate creatives')
      }

      const data = await response.json()

      if (data.success) {
        toast.success('Creativos generados exitosamente')
        await loadCreatives()
      } else {
        throw new Error(data.error || 'Unknown error')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
      setStatus('error')
      toast.error(`Error: ${message}`)
    }
  }

  // Copy text to clipboard
  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => setCopiedField(null), 2000)
      toast.success('Copiado al portapapeles')
    } catch {
      toast.error('Error al copiar')
    }
  }

  const CopyButton = ({ text, fieldName }: { text: string; fieldName: string }) => (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 shrink-0"
      onClick={() => handleCopy(text, fieldName)}
    >
      {copiedField === fieldName ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  )

  const renderVariantContent = (creative: PackageAICreative) => (
    <div className="space-y-4">
      {/* Text Content */}
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Título Principal</p>
            <p className="font-semibold text-lg">{creative.titulo_principal}</p>
          </div>
          <CopyButton text={creative.titulo_principal} fieldName={`${creative.variant}-titulo`} />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Subtítulo</p>
            <p>{creative.subtitulo}</p>
          </div>
          <CopyButton text={creative.subtitulo} fieldName={`${creative.variant}-subtitulo`} />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Precio</p>
            <p className="text-xl font-bold text-green-600">{creative.precio_texto}</p>
          </div>
          <CopyButton text={creative.precio_texto} fieldName={`${creative.variant}-precio`} />
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">CTA</p>
            <Badge variant="secondary">{creative.cta}</Badge>
          </div>
          <CopyButton text={creative.cta} fieldName={`${creative.variant}-cta`} />
        </div>

        {creative.estilo && (
          <div>
            <p className="text-xs text-muted-foreground mb-1">Estilo Visual</p>
            <p className="text-sm italic text-muted-foreground">{creative.estilo}</p>
          </div>
        )}
      </div>

      {/* Image Prompt */}
      <div className="border-t pt-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-1">Prompt para Imagen (EN)</p>
            <p className="text-sm bg-gray-50 p-2 rounded text-gray-700">
              {creative.descripcion_imagen}
            </p>
          </div>
          <CopyButton
            text={creative.descripcion_imagen}
            fieldName={`${creative.variant}-imagen`}
          />
        </div>
      </div>

      {/* Generated Images */}
      {(creative.image_4x5_url || creative.image_9x16_url) && (
        <div className="border-t pt-3">
          <p className="text-xs text-muted-foreground mb-2">Imágenes Generadas</p>
          <div className="flex gap-2">
            {creative.image_4x5_url && (
              <a
                href={creative.image_4x5_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ImageIcon className="h-3 w-3" />
                4:5
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {creative.image_9x16_url && (
              <a
                href={creative.image_9x16_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
              >
                <ImageIcon className="h-3 w-3" />
                9:16
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Generar Creativos con IA
          </DialogTitle>
          <DialogDescription>
            Paquete #{packageId} - {packageTitle}
          </DialogDescription>
        </DialogHeader>

        {/* Status messages */}
        {status === 'loading' && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-2">Cargando creativos...</span>
          </div>
        )}

        {status === 'generating-text' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
            <div className="text-center">
              <p className="font-medium">Generando creativos con Gemini...</p>
              <p className="text-sm text-muted-foreground">
                Esto puede tomar unos segundos
              </p>
            </div>
          </div>
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <div className="text-center">
              <p className="font-medium text-red-600">Error al generar</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={handleGenerate} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Reintentar
            </Button>
          </div>
        )}

        {/* No creatives yet - Show generate button */}
        {status === 'idle' && creatives.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 space-y-4">
            <div className="bg-purple-50 p-4 rounded-full">
              <Sparkles className="h-12 w-12 text-purple-500" />
            </div>
            <div className="text-center">
              <p className="font-medium">No hay creativos generados</p>
              <p className="text-sm text-muted-foreground">
                Genera 5 variantes de texto y (opcionalmente) imágenes con IA
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                id="generateImages"
                checked={generateImages}
                onChange={(e) => setGenerateImages(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="generateImages" className="flex items-center gap-1">
                <ImageIcon className="h-4 w-4" />
                También generar imágenes (más lento, usa Imagen 3)
              </label>
            </div>

            <Button onClick={handleGenerate} className="bg-purple-600 hover:bg-purple-700">
              <Sparkles className="h-4 w-4 mr-2" />
              Generar con IA
            </Button>
          </div>
        )}

        {/* Show creatives */}
        {status === 'done' && creatives.length > 0 && (
          <div className="space-y-4">
            {/* Actions */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  id="generateImages2"
                  checked={generateImages}
                  onChange={(e) => setGenerateImages(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="generateImages2" className="flex items-center gap-1">
                  <ImageIcon className="h-4 w-4" />
                  Incluir imágenes
                </label>
              </div>
              <Button
                onClick={handleGenerate}
                variant="outline"
                size="sm"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Regenerar Todo
              </Button>
            </div>

            {/* Tabs for variants */}
            <Tabs defaultValue="1" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                {[1, 2, 3, 4, 5].map((v) => (
                  <TabsTrigger key={v} value={String(v)}>
                    V{v}
                  </TabsTrigger>
                ))}
              </TabsList>

              <div className="h-[400px] mt-4 overflow-auto">
                {[1, 2, 3, 4, 5].map((v) => {
                  const creative = creatives.find((c) => c.variant === v)
                  return (
                    <TabsContent key={v} value={String(v)} className="mt-0">
                      {creative ? (
                        renderVariantContent(creative)
                      ) : (
                        <p className="text-muted-foreground text-center py-4">
                          Variante {v} no generada
                        </p>
                      )}
                    </TabsContent>
                  )
                })}
              </div>
            </Tabs>

            {/* Metadata */}
            {creatives[0] && (
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <div className="flex gap-4 flex-wrap">
                  <span>Modelo: {creatives[0].model_used}</span>
                  <span>Prompt: {creatives[0].prompt_version}</span>
                  <span>
                    Generado:{' '}
                    {new Date(creatives[0].created_at).toLocaleString('es-AR')}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
