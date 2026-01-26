'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Loader2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
  Settings,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface AIGeneratorModalProps {
  packageId: number
  packageTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GenerationStep = 'select' | 'generating-1x1' | 'review-1x1' | 'generating-9x16' | 'complete' | 'error'

interface VariantInfo {
  variant_number: number
  name: string
  focus: string
  description_es: string
}

interface BrandAssetsStatus {
  system_instruction: boolean
  logo_base64: boolean
  reference_images_count: number
}

interface GeneratedImage {
  aspectRatio: '1x1' | '9x16'
  imageUrl: string
  fileId?: string
}

const DEFAULT_VARIANTS: VariantInfo[] = [
  { variant_number: 1, name: 'Precio/Oferta', focus: 'PRICE', description_es: 'Sí, a este precio' },
  { variant_number: 2, name: 'Experiencia', focus: 'EMOTION', description_es: 'Sí, me lo merezco' },
  { variant_number: 3, name: 'Destino', focus: 'DESTINATION', description_es: 'Sí, existe' },
  { variant_number: 4, name: 'Conveniencia', focus: 'CONVENIENCE', description_es: 'Sí, todo resuelto' },
  { variant_number: 5, name: 'Escasez', focus: 'SCARCITY', description_es: 'Sí, ahora' },
]

export function AIGeneratorModal({
  packageId,
  packageTitle,
  open,
  onOpenChange,
}: AIGeneratorModalProps) {
  const [step, setStep] = useState<GenerationStep>('select')
  const [selectedVariant, setSelectedVariant] = useState<number>(1)
  const [variants, setVariants] = useState<VariantInfo[]>(DEFAULT_VARIANTS)
  const [assetsStatus, setAssetsStatus] = useState<BrandAssetsStatus | null>(null)
  const [generatedImages, setGeneratedImages] = useState<GeneratedImage[]>([])
  const [error, setError] = useState<string | null>(null)
  const [currentMessage, setCurrentMessage] = useState<string>('')
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load variants and assets status
  const loadInitialData = useCallback(async () => {
    try {
      const [variantsRes, assetsRes] = await Promise.all([
        fetch('/api/ai/prompt-variants'),
        fetch('/api/ai/brand-assets')
      ])

      if (variantsRes.ok) {
        const data = await variantsRes.json()
        if (data.variants?.length > 0) {
          setVariants(data.variants.map((v: VariantInfo) => ({
            variant_number: v.variant_number,
            name: v.name,
            focus: v.focus,
            description_es: v.description_es,
          })))
        }
      }

      if (assetsRes.ok) {
        const data = await assetsRes.json()
        const assets = data.assets || {}
        setAssetsStatus({
          system_instruction: !!assets.system_instruction?.value,
          logo_base64: !!assets.logo_base64?.value,
          reference_images_count: [1,2,3,4,5,6].filter(n => assets[`reference_image_${n}`]?.value).length,
        })
      }
    } catch (err) {
      console.error('Error loading initial data:', err)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadInitialData()
      setStep('select')
      setGeneratedImages([])
      setError(null)
      setCurrentMessage('')
    } else {
      abortControllerRef.current?.abort()
    }
  }, [open, loadInitialData])

  // Generate image with SSE
  const generateImage = async (aspectRatio: '1x1' | '9x16') => {
    const isSquare = aspectRatio === '1x1'
    setStep(isSquare ? 'generating-1x1' : 'generating-9x16')
    setCurrentMessage(isSquare ? 'Generando imagen 1:1...' : 'Adaptando a formato 9:16...')
    setError(null)

    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/ai/generate-creatives-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          variants: [selectedVariant],
          aspectRatios: [aspectRatio === '1x1' ? '1:1' : '9:16'],
          includeLogo: true,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Error al generar')
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      if (!reader) throw new Error('No response body')

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              handleSSEEvent(event, aspectRatio)
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
      setStep('error')
      toast.error(message)
    }
  }

  const handleSSEEvent = (event: { type: string; data: Record<string, unknown> }, aspectRatio: '1x1' | '9x16') => {
    const { type, data } = event

    switch (type) {
      case 'progress':
        setCurrentMessage(data.step as string)
        break

      case 'variant_complete':
        const newImage: GeneratedImage = {
          aspectRatio,
          imageUrl: data.imageUrl as string,
          fileId: data.fileId as string,
        }
        setGeneratedImages(prev => [...prev.filter(img => img.aspectRatio !== aspectRatio), newImage])
        setStep(aspectRatio === '1x1' ? 'review-1x1' : 'complete')
        toast.success(`Imagen ${aspectRatio} generada`)
        break

      case 'variant_error':
        setError(data.error as string)
        setStep('error')
        break

      case 'complete':
        // Handled by variant_complete
        break

      case 'error':
        setError(data.error as string)
        setStep('error')
        break
    }
  }

  const getImage = (aspectRatio: '1x1' | '9x16') => generatedImages.find(img => img.aspectRatio === aspectRatio)

  const resetToSelect = () => {
    setStep('select')
    setGeneratedImages([])
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader className="pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-teal-500" />
            Generar Creativos IA
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Paquete #{packageId}
          </p>
        </DialogHeader>

        <div className="py-4 space-y-6">
          {/* Step: Select Variant */}
          {step === 'select' && (
            <>
              {/* Assets Status - Compact */}
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Assets:</span>
                <Badge variant={assetsStatus?.system_instruction ? 'default' : 'outline'}
                       className={`text-xs py-0 ${assetsStatus?.system_instruction ? 'bg-teal-100 text-teal-700' : 'text-gray-400'}`}>
                  {assetsStatus?.system_instruction ? '✓' : '○'} Instrucciones
                </Badge>
                <Badge variant={assetsStatus?.logo_base64 ? 'default' : 'outline'}
                       className={`text-xs py-0 ${assetsStatus?.logo_base64 ? 'bg-teal-100 text-teal-700' : 'text-gray-400'}`}>
                  {assetsStatus?.logo_base64 ? '✓' : '○'} Logo
                </Badge>
                <Badge variant={(assetsStatus?.reference_images_count ?? 0) > 0 ? 'default' : 'outline'}
                       className={`text-xs py-0 ${(assetsStatus?.reference_images_count ?? 0) > 0 ? 'bg-teal-100 text-teal-700' : 'text-gray-400'}`}>
                  {(assetsStatus?.reference_images_count ?? 0) > 0 ? '✓' : '○'} Ref ({assetsStatus?.reference_images_count ?? 0})
                </Badge>
                <Link href="/ai-debug" className="text-blue-600 hover:underline ml-auto">
                  <Settings className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Variant Selection - Clean List */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Seleccionar variante:</p>
                <div className="grid grid-cols-1 gap-2">
                  {variants.map((v) => (
                    <button
                      key={v.variant_number}
                      onClick={() => setSelectedVariant(v.variant_number)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        selectedVariant === v.variant_number
                          ? 'border-teal-500 bg-teal-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedVariant === v.variant_number ? 'border-teal-500' : 'border-gray-300'
                      }`}>
                        {selectedVariant === v.variant_number && (
                          <div className="h-2 w-2 rounded-full bg-teal-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm">V{v.variant_number}</span>
                          <span className="text-sm text-gray-700">{v.name}</span>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{v.description_es}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={() => generateImage('1x1')}
                className="w-full bg-gradient-to-r from-navy-700 to-teal-500 hover:from-navy-800 hover:to-teal-600"
                size="lg"
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generar Imagen 1:1
              </Button>
            </>
          )}

          {/* Step: Generating */}
          {(step === 'generating-1x1' || step === 'generating-9x16') && (
            <div className="text-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-teal-500 mx-auto" />
              <div>
                <p className="font-medium">
                  {step === 'generating-1x1' ? 'Generando V' + selectedVariant + ' (1:1)' : 'Creando versión 9:16'}
                </p>
                <p className="text-sm text-muted-foreground mt-1">{currentMessage}</p>
              </div>
            </div>
          )}

          {/* Step: Review 1:1 */}
          {step === 'review-1x1' && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium">Imagen 1:1 generada</p>
              </div>

              {/* Image Preview */}
              {getImage('1x1') && (
                <div className="border rounded-lg overflow-hidden bg-gray-100">
                  <div className="aspect-square flex items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200">
                    <div className="text-center">
                      <ImageIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <a
                        href={getImage('1x1')?.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline inline-flex items-center gap-1"
                      >
                        Ver imagen completa <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3">
                <Button
                  variant="outline"
                  onClick={() => generateImage('1x1')}
                  className="w-full"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerar 1:1
                </Button>
                <Button
                  onClick={() => generateImage('9x16')}
                  className="w-full bg-teal-600 hover:bg-teal-700"
                >
                  Crear 9:16 <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                Si el diseño no te convence, regenerá. Si está bien, creá la versión vertical.
              </p>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="space-y-4">
              <div className="text-center">
                <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                <p className="font-medium">Creativos generados</p>
                <p className="text-sm text-muted-foreground">V{selectedVariant} - {variants.find(v => v.variant_number === selectedVariant)?.name}</p>
              </div>

              {/* Both Images */}
              <div className="grid grid-cols-2 gap-3">
                {/* 1:1 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="aspect-square bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="p-2 bg-white border-t">
                    <p className="text-xs font-medium text-center">1:1 Feed</p>
                    {getImage('1x1') && (
                      <a
                        href={getImage('1x1')?.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1 mt-1"
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>

                {/* 9:16 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="aspect-[9/16] bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    <ImageIcon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="p-2 bg-white border-t">
                    <p className="text-xs font-medium text-center">9:16 Stories</p>
                    {getImage('9x16') && (
                      <a
                        href={getImage('9x16')?.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-blue-600 hover:underline flex items-center justify-center gap-1 mt-1"
                      >
                        Ver <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button variant="outline" onClick={resetToSelect} className="flex-1">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Nueva variante
                </Button>
                <Button variant="outline" onClick={() => setStep('review-1x1')} className="flex-1">
                  Regenerar
                </Button>
              </div>
            </div>
          )}

          {/* Step: Error */}
          {step === 'error' && (
            <div className="text-center py-8 space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
              <div>
                <p className="font-medium text-red-600">Error al generar</p>
                <p className="text-sm text-muted-foreground mt-1">{error}</p>
              </div>
              <Button variant="outline" onClick={resetToSelect}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Intentar de nuevo
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
