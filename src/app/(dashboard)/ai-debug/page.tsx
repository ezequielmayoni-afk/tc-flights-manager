'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Sparkles,
  FileText,
  Image as ImageIcon,
  Clock,
  ExternalLink,
  Save,
  Upload,
  Trash2,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight,
  Plus,
  Pencil,
} from 'lucide-react'
import { toast } from 'sonner'

// Types
interface GenerationLog {
  id: string
  package_id: number
  tc_package_id: number
  variant: number
  aspect_ratio: string
  prompt_used: string
  model_used: string
  package_data: Record<string, unknown>
  assets_used: Record<string, boolean>
  status: 'pending' | 'generating' | 'success' | 'error'
  image_url: string | null
  image_file_id: string | null
  error_message: string | null
  started_at: string
  completed_at: string | null
  duration_ms: number | null
  created_at: string
}

interface BrandAsset {
  key: string
  value: string
  content_type: string | null
  description: string | null
  updated_at: string
}

interface PromptVariant {
  variant_number: number
  name: string
  focus: string
  description_es: string
  visual_direction: string
  hook_phrases: string[]
  prompt_addition: string
  is_active: boolean
  updated_at: string
}

// Status styles
const statusStyles: Record<string, string> = {
  success: 'bg-green-100 text-green-800 border-green-200',
  error: 'bg-red-100 text-red-800 border-red-200',
  generating: 'bg-purple-100 text-purple-800 border-purple-200',
  pending: 'bg-gray-100 text-gray-800 border-gray-200',
}

const variantNames: Record<number, string> = {
  1: 'Precio/Oferta',
  2: 'Experiencia/Emoción',
  3: 'Destino',
  4: 'Conveniencia',
  5: 'Escasez',
}

export default function AIDebugPage() {
  const [activeTab, setActiveTab] = useState('history')

  // History state
  const [logs, setLogs] = useState<GenerationLog[]>([])
  const [logsLoading, setLogsLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<GenerationLog | null>(null)
  const [logFilter, setLogFilter] = useState({ status: 'all', variant: 'all' })
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const pageSize = 20

  // Assets state
  const [assets, setAssets] = useState<Record<string, BrandAsset>>({})
  const [assetsLoading, setAssetsLoading] = useState(true)
  const [editingAsset, setEditingAsset] = useState<string | null>(null)
  const [assetValue, setAssetValue] = useState('')
  const [savingAsset, setSavingAsset] = useState(false)

  // Variants state
  const [variants, setVariants] = useState<PromptVariant[]>([])
  const [variantsLoading, setVariantsLoading] = useState(true)
  const [selectedVariant, setSelectedVariant] = useState<PromptVariant | null>(null)
  const [isVariantModalOpen, setIsVariantModalOpen] = useState(false)
  const [editingVariant, setEditingVariant] = useState<PromptVariant | null>(null)
  const [savingVariant, setSavingVariant] = useState(false)
  const [variantForm, setVariantForm] = useState({
    name: '',
    focus: '',
    description_es: '',
    visual_direction: '',
    hook_phrases: '',
    prompt_addition: '',
    is_active: true,
  })

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      })

      if (logFilter.status !== 'all') params.set('status', logFilter.status)

      const response = await fetch(`/api/ai/generate-creatives-v2?${params}`)
      const data = await response.json()

      if (response.ok) {
        let filteredLogs = data.logs || []
        if (logFilter.variant !== 'all') {
          filteredLogs = filteredLogs.filter(
            (l: GenerationLog) => l.variant === parseInt(logFilter.variant)
          )
        }
        setLogs(filteredLogs)
        setTotal(data.count || 0)
      } else {
        toast.error('Error al cargar logs')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLogsLoading(false)
    }
  }, [page, logFilter])

  // Fetch assets
  const fetchAssets = useCallback(async () => {
    setAssetsLoading(true)
    try {
      const response = await fetch('/api/ai/brand-assets')
      const data = await response.json()

      if (response.ok) {
        setAssets(data.assets || {})
      } else {
        toast.error('Error al cargar assets')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setAssetsLoading(false)
    }
  }, [])

  // Fetch variants
  const fetchVariants = useCallback(async () => {
    setVariantsLoading(true)
    try {
      const response = await fetch('/api/ai/prompt-variants?activeOnly=false')
      const data = await response.json()

      if (response.ok) {
        setVariants(data.variants || [])
      } else {
        toast.error('Error al cargar variantes')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setVariantsLoading(false)
    }
  }, [])

  // Load data on tab change
  useEffect(() => {
    if (activeTab === 'history') {
      fetchLogs()
    } else if (activeTab === 'assets') {
      fetchAssets()
    } else if (activeTab === 'variants') {
      fetchVariants()
    }
  }, [activeTab, fetchLogs, fetchAssets, fetchVariants])

  // Save asset
  const handleSaveAsset = async (key: string) => {
    setSavingAsset(true)
    try {
      const response = await fetch('/api/ai/brand-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value: assetValue }),
      })

      if (response.ok) {
        toast.success(`Asset "${key}" guardado`)
        setEditingAsset(null)
        fetchAssets()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSavingAsset(false)
    }
  }

  // Clear asset
  const handleClearAsset = async (key: string) => {
    if (!confirm(`¿Eliminar contenido de "${key}"?`)) return

    try {
      const response = await fetch(`/api/ai/brand-assets?key=${key}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success(`Asset "${key}" limpiado`)
        fetchAssets()
      } else {
        toast.error('Error al eliminar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  // Open variant modal for creating
  const handleOpenCreateVariant = () => {
    setEditingVariant(null)
    setVariantForm({
      name: '',
      focus: '',
      description_es: '',
      visual_direction: '',
      hook_phrases: '',
      prompt_addition: '',
      is_active: true,
    })
    setIsVariantModalOpen(true)
  }

  // Open variant modal for editing
  const handleOpenEditVariant = (variant: PromptVariant) => {
    setEditingVariant(variant)
    setVariantForm({
      name: variant.name,
      focus: variant.focus,
      description_es: variant.description_es,
      visual_direction: variant.visual_direction,
      hook_phrases: variant.hook_phrases.join('\n'),
      prompt_addition: variant.prompt_addition,
      is_active: variant.is_active,
    })
    setIsVariantModalOpen(true)
  }

  // Save variant (create or update)
  const handleSaveVariant = async () => {
    if (!variantForm.name || !variantForm.focus || !variantForm.description_es ||
        !variantForm.visual_direction || !variantForm.hook_phrases || !variantForm.prompt_addition) {
      toast.error('Todos los campos son requeridos')
      return
    }

    setSavingVariant(true)
    try {
      const hookPhrasesArray = variantForm.hook_phrases
        .split('\n')
        .map(p => p.trim())
        .filter(p => p.length > 0)

      if (hookPhrasesArray.length === 0) {
        toast.error('Debe ingresar al menos una hook phrase')
        setSavingVariant(false)
        return
      }

      const body = {
        name: variantForm.name,
        focus: variantForm.focus,
        description_es: variantForm.description_es,
        visual_direction: variantForm.visual_direction,
        hook_phrases: hookPhrasesArray,
        prompt_addition: variantForm.prompt_addition,
        is_active: variantForm.is_active,
        ...(editingVariant && { variant_number: editingVariant.variant_number }),
      }

      const response = await fetch('/api/ai/prompt-variants', {
        method: editingVariant ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (response.ok) {
        toast.success(editingVariant ? 'Variante actualizada' : 'Variante creada')
        setIsVariantModalOpen(false)
        fetchVariants()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSavingVariant(false)
    }
  }

  // Delete variant
  const handleDeleteVariant = async (variantNumber: number) => {
    if (!confirm(`¿Eliminar la variante V${variantNumber}? Esta acción no se puede deshacer.`)) return

    try {
      const response = await fetch(`/api/ai/prompt-variants?variant_number=${variantNumber}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success(`Variante V${variantNumber} eliminada`)
        fetchVariants()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al eliminar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  // Format date
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Format duration
  const formatDuration = (ms: number | null) => {
    if (!ms) return '-'
    return `${(ms / 1000).toFixed(1)}s`
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-teal-500" />
            AI Debug & Configuración
          </h1>
          <p className="text-muted-foreground">
            Historial de generaciones, assets de marca y configuración de prompts
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3 max-w-md">
          <TabsTrigger value="history">Historial</TabsTrigger>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="variants">Variantes</TabsTrigger>
        </TabsList>

        {/* History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap gap-4 items-center">
                <Select
                  value={logFilter.status}
                  onValueChange={(v) => { setLogFilter(f => ({ ...f, status: v })); setPage(0) }}
                >
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="success">Exitoso</SelectItem>
                    <SelectItem value="error">Error</SelectItem>
                    <SelectItem value="generating">Generando</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={logFilter.variant}
                  onValueChange={(v) => { setLogFilter(f => ({ ...f, variant: v })); setPage(0) }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Variante" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {[1, 2, 3, 4, 5].map(v => (
                      <SelectItem key={v} value={String(v)}>V{v} - {variantNames[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button variant="outline" onClick={fetchLogs} disabled={logsLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${logsLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-medium">
                {total} generación(es) registrada(s)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[140px]">Fecha</TableHead>
                    <TableHead className="w-[80px]">Estado</TableHead>
                    <TableHead className="w-[100px]">Paquete</TableHead>
                    <TableHead className="w-[140px]">Variante</TableHead>
                    <TableHead className="w-[80px]">Formato</TableHead>
                    <TableHead className="w-[80px]">Tiempo</TableHead>
                    <TableHead>Error</TableHead>
                    <TableHead className="w-[100px]">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logsLoading ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8">
                        <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ) : logs.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                        No hay generaciones registradas
                      </TableCell>
                    </TableRow>
                  ) : (
                    logs.map((log) => (
                      <TableRow
                        key={log.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedLog(log)}
                      >
                        <TableCell className="font-mono text-xs">
                          {formatDate(log.created_at)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={statusStyles[log.status]}
                          >
                            {log.status === 'success' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                            {log.status === 'error' && <XCircle className="h-3 w-3 mr-1" />}
                            {log.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          #{log.tc_package_id}
                        </TableCell>
                        <TableCell className="text-sm">
                          V{log.variant} - {variantNames[log.variant]}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {log.aspect_ratio}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDuration(log.duration_ms)}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-xs text-red-600">
                          {log.error_message || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); setSelectedLog(log) }}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            {log.image_url && (
                              <a
                                href={log.image_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Button variant="ghost" size="sm">
                                  <ExternalLink className="h-3 w-3" />
                                </Button>
                              </a>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <p className="text-sm text-muted-foreground">
                    Página {page + 1} de {totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(0, p - 1))}
                      disabled={page === 0}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                      disabled={page >= totalPages - 1}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Assets Tab */}
        <TabsContent value="assets" className="space-y-4">
          <div className="grid gap-4">
            {/* System Instruction - PRIMERO porque es el más importante */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Sparkles className="h-5 w-5" />
                      System Instruction
                    </CardTitle>
                    <CardDescription>
                      Instrucciones del sistema para Gemini (incluye manual de marca y análisis de estilo)
                    </CardDescription>
                  </div>
                  <Badge variant={assets.system_instruction?.value ? 'default' : 'outline'}>
                    {assets.system_instruction?.value ? `${assets.system_instruction.value.length} chars` : 'Vacío'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {editingAsset === 'system_instruction' ? (
                  <div className="space-y-3">
                    <Textarea
                      value={assetValue}
                      onChange={(e) => setAssetValue(e.target.value)}
                      rows={20}
                      placeholder="Eres un diseñador gráfico profesional especializado en publicidad turística para Si, Viajo...

Incluye aquí:
- Instrucciones de comportamiento
- Manual de marca
- Análisis de estilo visual
- Reglas de diseño"
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveAsset('system_instruction')}
                        disabled={savingAsset}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingAsset(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assets.system_instruction?.value ? (
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[300px] whitespace-pre-wrap">
                        {assets.system_instruction.value.slice(0, 2000)}
                        {assets.system_instruction.value.length > 2000 && '...'}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin system instruction configurado</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAssetValue(assets.system_instruction?.value || '')
                          setEditingAsset('system_instruction')
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {assets.system_instruction?.value ? 'Editar' : 'Configurar'}
                      </Button>
                      {assets.system_instruction?.value && (
                        <Button
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleClearAsset('system_instruction')}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Limpiar
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ImageIcon className="h-5 w-5" />
                      Logo
                    </CardTitle>
                    <CardDescription>
                      Logo de Sí, Viajo en Base64 (PNG)
                    </CardDescription>
                  </div>
                  <Badge variant={assets.logo_base64?.value ? 'default' : 'outline'}>
                    {assets.logo_base64?.value ? `${Math.round(assets.logo_base64.value.length / 1024)}KB` : 'Vacío'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {editingAsset === 'logo_base64' ? (
                  <div className="space-y-3">
                    <div>
                      <Label>Pegar Base64 del logo (sin el prefijo data:image/png;base64,)</Label>
                      <Textarea
                        value={assetValue}
                        onChange={(e) => setAssetValue(e.target.value)}
                        rows={5}
                        placeholder="iVBORw0KGgoAAAANSUhEUgAA..."
                        className="font-mono text-xs mt-2"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveAsset('logo_base64')}
                        disabled={savingAsset}
                      >
                        <Save className="h-4 w-4 mr-2" />
                        Guardar
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setEditingAsset(null)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {assets.logo_base64?.value ? (
                      <div className="flex items-center gap-4">
                        <img
                          src={`data:image/png;base64,${assets.logo_base64.value}`}
                          alt="Logo Sí, Viajo"
                          className="h-20 w-auto bg-gray-100 rounded p-2"
                        />
                        <p className="text-sm text-muted-foreground">
                          Logo cargado correctamente
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin logo cargado</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAssetValue(assets.logo_base64?.value || '')
                          setEditingAsset('logo_base64')
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {assets.logo_base64?.value ? 'Cambiar' : 'Cargar'}
                      </Button>
                      {assets.logo_base64?.value && (
                        <Button
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleClearAsset('logo_base64')}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Eliminar
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Reference Images */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Imágenes de Referencia
                </CardTitle>
                <CardDescription>
                  Hasta 6 imágenes que Gemini usará como referencia de estilo/composición
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6].map((num) => {
                    const key = `reference_image_${num}` as const
                    const asset = assets[key]
                    return (
                      <div key={key} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">Referencia {num}</span>
                          <Badge variant={asset?.value ? 'default' : 'outline'} className="text-xs">
                            {asset?.value ? `${Math.round(asset.value.length / 1024)}KB` : 'Vacío'}
                          </Badge>
                        </div>

                        {editingAsset === key ? (
                          <div className="space-y-2">
                            <Textarea
                              value={assetValue}
                              onChange={(e) => setAssetValue(e.target.value)}
                              rows={3}
                              placeholder="iVBORw0KGgoAAAANSUhEUgAA..."
                              className="font-mono text-xs"
                            />
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                onClick={() => handleSaveAsset(key)}
                                disabled={savingAsset}
                              >
                                <Save className="h-3 w-3 mr-1" />
                                Guardar
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setEditingAsset(null)}
                              >
                                Cancelar
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {asset?.value ? (
                              <img
                                src={asset.value.startsWith('data:') ? asset.value : `data:image/png;base64,${asset.value}`}
                                alt={`Referencia ${num}`}
                                className="w-full h-32 object-cover bg-gray-100 rounded"
                              />
                            ) : (
                              <div className="w-full h-32 bg-gray-100 rounded flex items-center justify-center text-muted-foreground text-sm">
                                Sin imagen
                              </div>
                            )}
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setAssetValue(asset?.value || '')
                                  setEditingAsset(key)
                                }}
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                {asset?.value ? 'Cambiar' : 'Cargar'}
                              </Button>
                              {asset?.value && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleClearAsset(key)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Variants Tab */}
        <TabsContent value="variants" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Variantes con &ldquo;Sí&rdquo;</CardTitle>
                  <CardDescription>
                    Cada variante apela a un motivador psicológico diferente para Meta Andromeda
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleOpenCreateVariant}>
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar
                  </Button>
                  <Button variant="outline" onClick={fetchVariants} disabled={variantsLoading}>
                    <RefreshCw className={`h-4 w-4 mr-2 ${variantsLoading ? 'animate-spin' : ''}`} />
                    Actualizar
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {variantsLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="grid gap-4">
                  {variants.map((variant) => (
                    <div
                      key={variant.variant_number}
                      className={`p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors ${!variant.is_active ? 'opacity-60' : ''}`}
                      onClick={() => setSelectedVariant(variant)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="bg-teal-100 text-teal-700 border-teal-300 font-bold"
                            >
                              V{variant.variant_number}
                            </Badge>
                            <span className="font-semibold">{variant.name}</span>
                            <Badge variant="secondary" className="text-xs">
                              {variant.focus}
                            </Badge>
                            {!variant.is_active && (
                              <Badge variant="outline" className="text-xs text-gray-500">
                                Inactiva
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {variant.description_es}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {variant.hook_phrases.slice(0, 2).map((phrase, i) => (
                              <span
                                key={i}
                                className="text-xs px-2 py-0.5 bg-navy-100 text-navy-700 rounded font-medium"
                              >
                                &ldquo;{phrase}&rdquo;
                              </span>
                            ))}
                            {variant.hook_phrases.length > 2 && (
                              <span className="text-xs px-2 py-0.5 text-muted-foreground">
                                +{variant.hook_phrases.length - 2} más
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); setSelectedVariant(variant) }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleOpenEditVariant(variant) }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={(e) => { e.stopPropagation(); handleDeleteVariant(variant.variant_number) }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge variant="outline" className={statusStyles[selectedLog?.status || 'pending']}>
                {selectedLog?.status}
              </Badge>
              <span className="font-normal text-muted-foreground">
                V{selectedLog?.variant} - {selectedLog?.aspect_ratio}
              </span>
            </DialogTitle>
            <DialogDescription>
              Paquete #{selectedLog?.tc_package_id} • {formatDate(selectedLog?.created_at || null)}
            </DialogDescription>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {/* Error */}
              {selectedLog.error_message && (
                <div>
                  <h4 className="text-sm font-medium text-red-600 mb-1 flex items-center gap-1">
                    <AlertCircle className="h-4 w-4" />
                    Error
                  </h4>
                  <p className="text-sm bg-red-50 text-red-800 p-3 rounded-lg">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}

              {/* Image */}
              {selectedLog.image_url && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1 flex items-center gap-1">
                    <ImageIcon className="h-4 w-4" />
                    Imagen Generada
                  </h4>
                  <a
                    href={selectedLog.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver en Google Drive
                  </a>
                </div>
              )}

              {/* Metadata */}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground">Modelo</h4>
                  <p className="text-sm font-mono">{selectedLog.model_used}</p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground">Duración</h4>
                  <p className="text-sm flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {formatDuration(selectedLog.duration_ms)}
                  </p>
                </div>
                <div>
                  <h4 className="text-xs font-medium text-muted-foreground">Assets Usados</h4>
                  <div className="flex gap-1 flex-wrap">
                    {selectedLog.assets_used && Object.entries(selectedLog.assets_used).map(([key, used]) => (
                      <Badge
                        key={key}
                        variant={used ? 'default' : 'outline'}
                        className={`text-xs ${used ? 'bg-green-100 text-green-700' : 'text-gray-400'}`}
                      >
                        {used ? '✓' : '○'} {key.replace('_', ' ')}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              {/* Package Data */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Datos del Paquete</h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[150px]">
                  {JSON.stringify(selectedLog.package_data, null, 2)}
                </pre>
              </div>

              {/* Prompt */}
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Prompt Enviado</h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[300px] whitespace-pre-wrap">
                  {selectedLog.prompt_used || 'No disponible'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Variant Detail Dialog */}
      <Dialog open={!!selectedVariant} onOpenChange={() => setSelectedVariant(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Badge className="bg-teal-500 text-white">V{selectedVariant?.variant_number}</Badge>
              {selectedVariant?.name}
            </DialogTitle>
            <DialogDescription>
              {selectedVariant?.description_es}
            </DialogDescription>
          </DialogHeader>

          {selectedVariant && (
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Focus</h4>
                <Badge variant="secondary">{selectedVariant.focus}</Badge>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Dirección Visual</h4>
                <p className="text-sm bg-muted p-3 rounded-lg">
                  {selectedVariant.visual_direction}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">Hook Phrases</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedVariant.hook_phrases.map((phrase, i) => (
                    <Badge key={i} variant="outline" className="bg-navy-50 text-navy-700">
                      &ldquo;{phrase}&rdquo;
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Instrucciones para Gemini
                </h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[300px] whitespace-pre-wrap">
                  {selectedVariant.prompt_addition}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Create/Edit Variant Dialog */}
      <Dialog open={isVariantModalOpen} onOpenChange={setIsVariantModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingVariant ? `Editar Variante V${editingVariant.variant_number}` : 'Nueva Variante'}
            </DialogTitle>
            <DialogDescription>
              {editingVariant
                ? 'Modifica los campos de la variante existente'
                : 'Crea una nueva variante con un enfoque psicológico diferente'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="variant-name">Nombre *</Label>
                <Input
                  id="variant-name"
                  placeholder="Ej: Precio/Oferta"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm(f => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="variant-focus">Focus *</Label>
                <Input
                  id="variant-focus"
                  placeholder="Ej: Ahorro"
                  value={variantForm.focus}
                  onChange={(e) => setVariantForm(f => ({ ...f, focus: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-description">Descripción (ES) *</Label>
              <Textarea
                id="variant-description"
                placeholder="Describe el enfoque psicológico de esta variante..."
                value={variantForm.description_es}
                onChange={(e) => setVariantForm(f => ({ ...f, description_es: e.target.value }))}
                rows={2}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-visual">Dirección Visual *</Label>
              <Textarea
                id="variant-visual"
                placeholder="Describe cómo debe verse la imagen generada..."
                value={variantForm.visual_direction}
                onChange={(e) => setVariantForm(f => ({ ...f, visual_direction: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-hooks">Hook Phrases * (una por línea)</Label>
              <Textarea
                id="variant-hooks"
                placeholder="Sí, ¡a este precio!&#10;Sí, ¡qué oferta!&#10;Sí, ¡lo quiero!"
                value={variantForm.hook_phrases}
                onChange={(e) => setVariantForm(f => ({ ...f, hook_phrases: e.target.value }))}
                rows={4}
                className="font-mono text-sm"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="variant-prompt">Instrucciones para Gemini (Prompt Addition) *</Label>
              <Textarea
                id="variant-prompt"
                placeholder="Instrucciones específicas que se agregarán al prompt de generación..."
                value={variantForm.prompt_addition}
                onChange={(e) => setVariantForm(f => ({ ...f, prompt_addition: e.target.value }))}
                rows={6}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="variant-active"
                checked={variantForm.is_active}
                onChange={(e) => setVariantForm(f => ({ ...f, is_active: e.target.checked }))}
                className="h-4 w-4 rounded border-gray-300"
              />
              <Label htmlFor="variant-active" className="font-normal">
                Variante activa (se usará en la generación de creativos)
              </Label>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setIsVariantModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveVariant} disabled={savingVariant}>
              {savingVariant ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {editingVariant ? 'Guardar Cambios' : 'Crear Variante'}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
