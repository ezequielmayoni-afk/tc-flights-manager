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
            {/* Manual de Marca */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Manual de Marca
                    </CardTitle>
                    <CardDescription>
                      Documento con la identidad de Sí, Viajo (Markdown)
                    </CardDescription>
                  </div>
                  <Badge variant={assets.manual_marca?.value ? 'default' : 'outline'}>
                    {assets.manual_marca?.value ? `${assets.manual_marca.value.length} chars` : 'Vacío'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {editingAsset === 'manual_marca' ? (
                  <div className="space-y-3">
                    <Textarea
                      value={assetValue}
                      onChange={(e) => setAssetValue(e.target.value)}
                      rows={15}
                      placeholder="Pega aquí el contenido del manual de marca en Markdown..."
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveAsset('manual_marca')}
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
                    {assets.manual_marca?.value ? (
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[200px] whitespace-pre-wrap">
                        {assets.manual_marca.value.slice(0, 1000)}
                        {assets.manual_marca.value.length > 1000 && '...'}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin contenido</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAssetValue(assets.manual_marca?.value || '')
                          setEditingAsset('manual_marca')
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {assets.manual_marca?.value ? 'Editar' : 'Cargar'}
                      </Button>
                      {assets.manual_marca?.value && (
                        <Button
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleClearAsset('manual_marca')}
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

            {/* Análisis de Estilo */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Análisis de Estilo Visual
                    </CardTitle>
                    <CardDescription>
                      Análisis del estilo Nano Banana / Sí, Viajo (Markdown)
                    </CardDescription>
                  </div>
                  <Badge variant={assets.analisis_estilo?.value ? 'default' : 'outline'}>
                    {assets.analisis_estilo?.value ? `${assets.analisis_estilo.value.length} chars` : 'Vacío'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                {editingAsset === 'analisis_estilo' ? (
                  <div className="space-y-3">
                    <Textarea
                      value={assetValue}
                      onChange={(e) => setAssetValue(e.target.value)}
                      rows={15}
                      placeholder="Pega aquí el análisis de estilo visual en Markdown..."
                      className="font-mono text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleSaveAsset('analisis_estilo')}
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
                    {assets.analisis_estilo?.value ? (
                      <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-[200px] whitespace-pre-wrap">
                        {assets.analisis_estilo.value.slice(0, 1000)}
                        {assets.analisis_estilo.value.length > 1000 && '...'}
                      </pre>
                    ) : (
                      <p className="text-sm text-muted-foreground">Sin contenido</p>
                    )}
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setAssetValue(assets.analisis_estilo?.value || '')
                          setEditingAsset('analisis_estilo')
                        }}
                      >
                        <Upload className="h-4 w-4 mr-2" />
                        {assets.analisis_estilo?.value ? 'Editar' : 'Cargar'}
                      </Button>
                      {assets.analisis_estilo?.value && (
                        <Button
                          variant="outline"
                          className="text-red-600"
                          onClick={() => handleClearAsset('analisis_estilo')}
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
          </div>
        </TabsContent>

        {/* Variants Tab */}
        <TabsContent value="variants" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Las 5 Variantes con &ldquo;Sí&rdquo;</CardTitle>
                  <CardDescription>
                    Cada variante apela a un motivador psicológico diferente para Meta Andromeda
                  </CardDescription>
                </div>
                <Button variant="outline" onClick={fetchVariants} disabled={variantsLoading}>
                  <RefreshCw className={`h-4 w-4 mr-2 ${variantsLoading ? 'animate-spin' : ''}`} />
                  Actualizar
                </Button>
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
                      className="p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
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
                          </div>
                        </div>
                        <Button variant="ghost" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
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
    </div>
  )
}
