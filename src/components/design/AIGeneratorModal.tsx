'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Loader2,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Image as ImageIcon,
  AlertCircle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  Download,
  FileText,
  Settings2,
  Bug,
} from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'

interface AIGeneratorModalProps {
  packageId: number
  packageTitle: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

type GenerationStatus = 'idle' | 'loading' | 'generating' | 'done' | 'error'

interface VariantInfo {
  variant_number: number
  name: string
  focus: string
  description_es: string
  visual_direction: string
  hook_phrases: string[]
  is_active: boolean
}

interface BrandAssetsStatus {
  manual_marca: boolean
  analisis_estilo: boolean
  logo_base64: boolean
}

interface GenerationResult {
  variant: number
  aspectRatio: string
  success: boolean
  imageUrl?: string
  error?: string
}

interface VariantProgress {
  variant: number
  aspectRatio: string
  status: 'pending' | 'generating' | 'completed' | 'error'
  step?: string
  imageUrl?: string
  error?: string
  durationMs?: number
}

// Variant info with "Sí" hooks (cached from DB)
const DEFAULT_VARIANTS: VariantInfo[] = [
  {
    variant_number: 1,
    name: 'Precio/Oferta',
    focus: 'PRICE',
    description_es: 'Sí, a este precio. Aprovecha ahora.',
    visual_direction: 'PRECIO GIGANTE en verde teal como elemento que detiene el scroll.',
    hook_phrases: ['SI, A ESTE PRECIO', '¿VACACIONES? SI, DESDE USD {price}'],
    is_active: true,
  },
  {
    variant_number: 2,
    name: 'Experiencia/Emoción',
    focus: 'EMOTION',
    description_es: 'Sí, me lo merezco. Escaparse, imaginarse ahí.',
    visual_direction: 'Persona con expresión de felicidad/éxtasis.',
    hook_phrases: ['SI, ME LO MEREZCO', '¿TE LO MERECES? SI'],
    is_active: true,
  },
  {
    variant_number: 3,
    name: 'Destino',
    focus: 'DESTINATION',
    description_es: 'Sí, existe. El lugar es protagonista.',
    visual_direction: 'Paisaje WOW que parece irreal.',
    hook_phrases: ['SI, EXISTE', '{DESTINATION}. SI, ES REAL'],
    is_active: true,
  },
  {
    variant_number: 4,
    name: 'Conveniencia',
    focus: 'CONVENIENCE',
    description_es: 'Sí, todo resuelto. Cero estrés.',
    visual_direction: 'Visual de "todo incluido". Persona relajada.',
    hook_phrases: ['SI, TODO RESUELTO', '¿COMPLICADO? NO. ¿FACIL? SI'],
    is_active: true,
  },
  {
    variant_number: 5,
    name: 'Escasez',
    focus: 'SCARCITY',
    description_es: 'Sí, ahora. Últimos lugares.',
    visual_direction: 'Urgencia máxima. Contador visual.',
    hook_phrases: ['SI, AHORA', 'ULTIMOS LUGARES. ¿VAS? SI'],
    is_active: true,
  },
]

export function AIGeneratorModal({
  packageId,
  packageTitle,
  open,
  onOpenChange,
}: AIGeneratorModalProps) {
  const [status, setStatus] = useState<GenerationStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [selectedVariants, setSelectedVariants] = useState<number[]>([1, 2, 3, 4, 5])
  const [variantProgress, setVariantProgress] = useState<VariantProgress[]>([])
  const [currentStep, setCurrentStep] = useState<string>('')
  const [results, setResults] = useState<GenerationResult[]>([])
  const [variants, setVariants] = useState<VariantInfo[]>(DEFAULT_VARIANTS)
  const [assetsStatus, setAssetsStatus] = useState<BrandAssetsStatus | null>(null)
  const [includeLogo, setIncludeLogo] = useState(true)
  const [showPromptPreview, setShowPromptPreview] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Load variants from DB and check assets status
  const loadInitialData = useCallback(async () => {
    try {
      // Load variants
      const variantsRes = await fetch('/api/ai/prompt-variants')
      if (variantsRes.ok) {
        const data = await variantsRes.json()
        if (data.variants && data.variants.length > 0) {
          setVariants(data.variants)
        }
      }

      // Check assets status
      const assetsRes = await fetch('/api/ai/brand-assets')
      if (assetsRes.ok) {
        const data = await assetsRes.json()
        setAssetsStatus({
          manual_marca: !!data.assets?.manual_marca?.value,
          analisis_estilo: !!data.assets?.analisis_estilo?.value,
          logo_base64: !!data.assets?.logo_base64?.value,
        })
      }
    } catch (err) {
      console.error('Error loading initial data:', err)
    }
  }, [])

  // Load existing creatives for this package
  const loadExistingCreatives = useCallback(async () => {
    if (!packageId) return

    setStatus('loading')
    try {
      const response = await fetch(`/api/ai/generate-creatives-v2?packageId=${packageId}&limit=20`)
      const data = await response.json()

      if (data.logs && data.logs.length > 0) {
        // Transform logs to results
        const existingResults: GenerationResult[] = data.logs
          .filter((log: { status: string }) => log.status === 'success')
          .map((log: { variant: number; aspect_ratio: string; image_url: string }) => ({
            variant: log.variant,
            aspectRatio: log.aspect_ratio,
            success: true,
            imageUrl: log.image_url,
          }))

        if (existingResults.length > 0) {
          setResults(existingResults)
          setStatus('done')
          return
        }
      }
      setStatus('idle')
    } catch (err) {
      console.error('Error loading existing creatives:', err)
      setStatus('idle')
    }
  }, [packageId])

  useEffect(() => {
    if (open) {
      loadInitialData()
      loadExistingCreatives()
      setError(null)
      setVariantProgress([])
      setCurrentStep('')
    } else {
      // Cleanup on close
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [open, loadInitialData, loadExistingCreatives])

  // Toggle variant selection
  const toggleVariant = (variant: number) => {
    setSelectedVariants(prev =>
      prev.includes(variant)
        ? prev.filter(v => v !== variant)
        : [...prev, variant].sort((a, b) => a - b)
    )
  }

  // Select/deselect all variants
  const toggleAllVariants = () => {
    if (selectedVariants.length === 5) {
      setSelectedVariants([])
    } else {
      setSelectedVariants([1, 2, 3, 4, 5])
    }
  }

  // Generate creatives with SSE streaming
  const handleGenerate = async () => {
    if (selectedVariants.length === 0) {
      toast.error('Selecciona al menos una variante')
      return
    }

    setStatus('generating')
    setError(null)
    setResults([])

    // Initialize progress for selected variants (both formats)
    const initialProgress: VariantProgress[] = []
    for (const v of selectedVariants) {
      initialProgress.push({ variant: v, aspectRatio: '1080', status: 'pending' })
      initialProgress.push({ variant: v, aspectRatio: '1920', status: 'pending' })
    }
    setVariantProgress(initialProgress)

    // Create AbortController for cleanup
    abortControllerRef.current = new AbortController()

    try {
      const response = await fetch('/api/ai/generate-creatives-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId,
          variants: selectedVariants,
          includeLogo,
        }),
        signal: abortControllerRef.current.signal,
      })

      if (!response.ok) {
        const errData = await response.json()
        throw new Error(errData.error || 'Failed to generate creatives')
      }

      // Handle SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body')
      }

      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE messages
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const eventData = JSON.parse(line.slice(6))
              handleSSEEvent(eventData)
            } catch {
              console.warn('Failed to parse SSE event:', line)
            }
          }
        }
      }

      toast.success('Generación completada')
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        console.log('Generation aborted')
        return
      }
      const message = err instanceof Error ? err.message : 'Error desconocido'
      setError(message)
      setStatus('error')
      toast.error(`Error: ${message}`)
    }
  }

  // Handle SSE events
  const handleSSEEvent = (event: { type: string; data: Record<string, unknown> }) => {
    const { type, data } = event

    switch (type) {
      case 'progress':
        setCurrentStep(data.step as string)
        if (data.variant && data.aspectRatio) {
          setVariantProgress(prev =>
            prev.map(vp =>
              vp.variant === data.variant && vp.aspectRatio === data.aspectRatio
                ? { ...vp, status: 'generating', step: data.step as string }
                : vp
            )
          )
        }
        break

      case 'variant_complete':
        setVariantProgress(prev =>
          prev.map(vp =>
            vp.variant === data.variant && vp.aspectRatio === data.aspectRatio
              ? {
                  ...vp,
                  status: 'completed',
                  imageUrl: data.imageUrl as string,
                  durationMs: data.durationMs as number,
                }
              : vp
          )
        )
        setResults(prev => [
          ...prev,
          {
            variant: data.variant as number,
            aspectRatio: data.aspectRatio as string,
            success: true,
            imageUrl: data.imageUrl as string,
          },
        ])
        break

      case 'variant_error':
        setVariantProgress(prev =>
          prev.map(vp =>
            vp.variant === data.variant && vp.aspectRatio === data.aspectRatio
              ? { ...vp, status: 'error', error: data.error as string }
              : vp
          )
        )
        setResults(prev => [
          ...prev,
          {
            variant: data.variant as number,
            aspectRatio: data.aspectRatio as string,
            success: false,
            error: data.error as string,
          },
        ])
        break

      case 'complete':
        setStatus('done')
        setCurrentStep('')
        break

      case 'error':
        setError(data.error as string)
        setStatus('error')
        break
    }
  }

  // Get result for a specific variant/format
  const getResult = (variant: number, aspectRatio: string) => {
    return results.find(r => r.variant === variant && r.aspectRatio === aspectRatio)
  }

  // Render variant selection card
  const renderVariantCard = (variantInfo: VariantInfo) => {
    const isSelected = selectedVariants.includes(variantInfo.variant_number)
    const v = variantInfo.variant_number

    return (
      <div
        key={v}
        onClick={() => toggleVariant(v)}
        className={`
          relative p-4 rounded-xl border-2 cursor-pointer transition-all
          ${isSelected
            ? 'border-teal-500 bg-teal-50/50'
            : 'border-gray-200 hover:border-gray-300 bg-white'
          }
        `}
      >
        <div className="flex items-start gap-3">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => toggleVariant(v)}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-bold text-lg text-navy-900">V{v}</span>
              <Badge
                variant="outline"
                className={`text-xs ${isSelected ? 'bg-teal-100 text-teal-700 border-teal-300' : ''}`}
              >
                {variantInfo.name}
              </Badge>
            </div>
            <p className="text-sm text-gray-600 mb-2">
              {variantInfo.description_es}
            </p>
            <div className="flex flex-wrap gap-1">
              {variantInfo.hook_phrases.slice(0, 2).map((phrase, i) => (
                <span
                  key={i}
                  className="text-xs px-2 py-0.5 bg-navy-100 text-navy-700 rounded font-medium"
                >
                  &ldquo;{phrase}&rdquo;
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render progress item
  const renderProgressItem = (vp: VariantProgress) => {
    const variantInfo = variants.find(v => v.variant_number === vp.variant)
    const formatLabel = vp.aspectRatio === '1080' ? 'Feed (1:1)' : 'Stories (9:16)'

    return (
      <div
        key={`${vp.variant}-${vp.aspectRatio}`}
        className={`flex items-center gap-3 p-3 rounded-lg border ${
          vp.status === 'generating'
            ? 'bg-purple-50 border-purple-200'
            : vp.status === 'completed'
            ? 'bg-green-50 border-green-200'
            : vp.status === 'error'
            ? 'bg-red-50 border-red-200'
            : 'bg-gray-50 border-gray-200'
        }`}
      >
        <div className="flex-shrink-0">
          {vp.status === 'pending' && <div className="h-5 w-5 rounded-full bg-gray-300" />}
          {vp.status === 'generating' && <Loader2 className="h-5 w-5 animate-spin text-purple-500" />}
          {vp.status === 'completed' && <CheckCircle2 className="h-5 w-5 text-green-500" />}
          {vp.status === 'error' && <XCircle className="h-5 w-5 text-red-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">
            V{vp.variant} - {variantInfo?.name || ''} - {formatLabel}
          </p>
          {vp.step && vp.status === 'generating' && (
            <p className="text-xs text-muted-foreground truncate">{vp.step}</p>
          )}
          {vp.error && <p className="text-xs text-red-600">{vp.error}</p>}
          {vp.durationMs && (
            <p className="text-xs text-muted-foreground">{(vp.durationMs / 1000).toFixed(1)}s</p>
          )}
        </div>
        {vp.status === 'completed' && vp.imageUrl && (
          <a
            href={vp.imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            onClick={e => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
            Ver
          </a>
        )}
      </div>
    )
  }

  // Render results grid
  const renderResultsGrid = () => {
    const successResults = results.filter(r => r.success)
    if (successResults.length === 0) return null

    // Group by variant
    const byVariant: Record<number, GenerationResult[]> = {}
    for (const r of successResults) {
      if (!byVariant[r.variant]) byVariant[r.variant] = []
      byVariant[r.variant].push(r)
    }

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-lg">
            Creativos Generados ({successResults.length})
          </h3>
          <div className="flex gap-2">
            <Link href="/ai-debug" target="_blank">
              <Button variant="outline" size="sm">
                <Bug className="h-4 w-4 mr-1" />
                Ver logs
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">Todos</TabsTrigger>
            {Object.keys(byVariant).map(v => (
              <TabsTrigger key={v} value={v}>V{v}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="all" className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              {successResults.map(r => {
                const variantInfo = variants.find(vi => vi.variant_number === r.variant)
                return (
                  <a
                    key={`${r.variant}-${r.aspectRatio}`}
                    href={r.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block relative rounded-lg overflow-hidden border bg-gray-100 hover:border-teal-500 transition-all"
                  >
                    <div className={`aspect-square bg-gradient-to-br from-navy-100 to-teal-100 flex items-center justify-center`}>
                      <ImageIcon className="h-8 w-8 text-gray-400" />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <ExternalLink className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                      <p className="text-white text-xs font-medium">
                        V{r.variant} - {r.aspectRatio === '1080' ? 'Feed' : 'Stories'}
                      </p>
                      <p className="text-white/70 text-xs truncate">
                        {variantInfo?.name}
                      </p>
                    </div>
                  </a>
                )
              })}
            </div>
          </TabsContent>

          {Object.entries(byVariant).map(([v, variantResults]) => (
            <TabsContent key={v} value={v} className="mt-4">
              <div className="grid grid-cols-2 gap-4">
                {variantResults.map(r => (
                  <a
                    key={`${r.variant}-${r.aspectRatio}`}
                    href={r.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block relative rounded-lg overflow-hidden border bg-gray-100 hover:border-teal-500 transition-all"
                  >
                    <div className={`${r.aspectRatio === '1080' ? 'aspect-square' : 'aspect-[9/16]'} bg-gradient-to-br from-navy-100 to-teal-100 flex items-center justify-center`}>
                      <ImageIcon className="h-12 w-12 text-gray-400" />
                    </div>
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
                      <Download className="h-6 w-6 text-white opacity-0 group-hover:opacity-100 transition-all" />
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                      <p className="text-white font-medium">
                        {r.aspectRatio === '1080' ? '1080×1080 Feed' : '1080×1920 Stories'}
                      </p>
                    </div>
                  </a>
                ))}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    )
  }

  const totalCreatives = selectedVariants.length * 2

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-teal-500" />
            Generar Creativos con IA
          </DialogTitle>
          <DialogDescription>
            Paquete #{packageId} - {packageTitle}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 pr-4 overflow-y-auto">
          {/* Loading state */}
          {status === 'loading' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2">Cargando...</span>
            </div>
          )}

          {/* Generation in progress */}
          {status === 'generating' && (
            <div className="space-y-4 py-4">
              <div className="text-center mb-4">
                <p className="font-medium text-lg">Generando {totalCreatives} creativos...</p>
                {currentStep && (
                  <p className="text-sm text-muted-foreground mt-1">{currentStep}</p>
                )}
              </div>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {variantProgress.map(renderProgressItem)}
              </div>
            </div>
          )}

          {/* Error state */}
          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <p className="font-medium text-red-600 text-lg">Error al generar</p>
                <p className="text-sm text-muted-foreground max-w-md">{error}</p>
              </div>
              <div className="flex gap-2">
                <Button onClick={handleGenerate} variant="outline">
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Reintentar
                </Button>
                <Link href="/ai-debug" target="_blank">
                  <Button variant="ghost">
                    <Bug className="h-4 w-4 mr-2" />
                    Ver logs
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {/* Idle state - Show generate options */}
          {(status === 'idle' || (status === 'done' && results.length === 0)) && (
            <div className="space-y-6 py-4">
              {/* Assets Status */}
              <div className="p-4 rounded-xl bg-gray-50 border">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Assets de Marca
                  </h3>
                  <Link href="/ai-debug" className="text-xs text-blue-600 hover:underline">
                    Configurar →
                  </Link>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={assetsStatus?.manual_marca ? 'default' : 'outline'} className={assetsStatus?.manual_marca ? 'bg-green-100 text-green-700' : 'text-gray-400'}>
                    {assetsStatus?.manual_marca ? '✓' : '○'} Manual de Marca
                  </Badge>
                  <Badge variant={assetsStatus?.analisis_estilo ? 'default' : 'outline'} className={assetsStatus?.analisis_estilo ? 'bg-green-100 text-green-700' : 'text-gray-400'}>
                    {assetsStatus?.analisis_estilo ? '✓' : '○'} Análisis de Estilo
                  </Badge>
                  <Badge variant={assetsStatus?.logo_base64 ? 'default' : 'outline'} className={assetsStatus?.logo_base64 ? 'bg-green-100 text-green-700' : 'text-gray-400'}>
                    {assetsStatus?.logo_base64 ? '✓' : '○'} Logo
                  </Badge>
                </div>
              </div>

              {/* Variant Selection */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-semibold">Seleccionar Variantes</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={toggleAllVariants}
                    className="text-xs"
                  >
                    {selectedVariants.length === 5 ? 'Deseleccionar todas' : 'Seleccionar todas'}
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {variants.map(renderVariantCard)}
                </div>
              </div>

              {/* Options */}
              <div>
                <Button
                  variant="ghost"
                  className="w-full justify-between"
                  onClick={() => setShowPromptPreview(!showPromptPreview)}
                >
                  <span className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4" />
                    Configuración avanzada
                  </span>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showPromptPreview ? 'rotate-180' : ''}`} />
                </Button>
                {showPromptPreview && (
                  <div className="space-y-4 pt-4">
                    <label className="flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-gray-50">
                      <Checkbox
                        checked={includeLogo}
                        onCheckedChange={(checked) => setIncludeLogo(checked as boolean)}
                      />
                      <div>
                        <p className="font-medium text-sm">Incluir logo como imagen de referencia</p>
                        <p className="text-xs text-muted-foreground">
                          Envía el logo a Gemini para que lo incluya en el creativo
                        </p>
                      </div>
                    </label>

                    <div className="p-3 rounded-lg border bg-gray-50">
                      <p className="text-sm font-medium mb-2">Modelo: gemini-3-pro-image-preview</p>
                      <p className="text-xs text-muted-foreground">
                        Generación profesional de imágenes con texto
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Generate Button */}
              <div className="flex flex-col items-center gap-4 pt-4 border-t">
                <Button
                  onClick={handleGenerate}
                  size="lg"
                  className="bg-gradient-to-r from-navy-700 to-teal-500 hover:from-navy-800 hover:to-teal-600 text-white px-8"
                  disabled={selectedVariants.length === 0}
                >
                  <Sparkles className="h-5 w-5 mr-2" />
                  Generar {totalCreatives} Creativos
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  {selectedVariants.length} variante{selectedVariants.length !== 1 ? 's' : ''} × 2 formatos (Feed + Stories)
                </p>
              </div>
            </div>
          )}

          {/* Done state - Show results */}
          {status === 'done' && results.length > 0 && (
            <div className="space-y-6 py-4">
              {renderResultsGrid()}

              {/* Regenerate options */}
              <div className="flex flex-col items-center gap-4 pt-4 border-t">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Regenerar:</span>
                    {[1, 2, 3, 4, 5].map((v) => (
                      <label key={v} className="flex items-center gap-1 cursor-pointer" title={variants.find(vi => vi.variant_number === v)?.name}>
                        <Checkbox
                          checked={selectedVariants.includes(v)}
                          onCheckedChange={() => toggleVariant(v)}
                          className="h-4 w-4"
                        />
                        <span className="text-xs font-medium">V{v}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <Button
                  onClick={handleGenerate}
                  variant="outline"
                  disabled={selectedVariants.length === 0}
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerar {selectedVariants.length * 2} creativos
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
