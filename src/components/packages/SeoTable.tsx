'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import {
  Sparkles,
  Settings,
  Loader2,
  Edit,
  Check,
  X,
  Filter,
  Upload,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

type PackageWithSeo = {
  id: number
  tc_package_id: number
  title: string
  seo_title: string | null
  seo_description: string | null
  seo_keywords: string | null
  meta_title: string | null
  meta_description: string | null
  image_alt: string | null
  include_sitemap: boolean
  seo_status: string | null
  seo_generated_at: string | null
  seo_uploaded_to_tc: boolean
}

interface SeoTableProps {
  packages: PackageWithSeo[]
}

export function SeoTable({ packages }: SeoTableProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [editingPackage, setEditingPackage] = useState<PackageWithSeo | null>(null)
  const [editForm, setEditForm] = useState<Partial<PackageWithSeo>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [showPromptConfig, setShowPromptConfig] = useState(false)
  const [promptTemplate, setPromptTemplate] = useState('')
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [isUploading, setIsUploading] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadLogs, setUploadLogs] = useState<string[]>([])
  const [uploadStatus, setUploadStatus] = useState<'running' | 'success' | 'error'>('running')
  const [uploadResults, setUploadResults] = useState<{ processed: number; success: number; errors: number } | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll logs
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [uploadLogs])

  // Filter packages by status
  const filteredPackages = statusFilter === 'all'
    ? packages
    : packages.filter(p => (p.seo_status || 'pending') === statusFilter)

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('seo-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredPackages.map(p => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelect = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id))
    }
  }

  const handleGenerate = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos un paquete')
      return
    }

    setIsGenerating(true)
    try {
      const response = await fetch('/api/seo/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: selectedIds }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al generar SEO')
      }

      toast.success(`SEO generado para ${data.generated} paquetes`)
      setSelectedIds([])
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al generar SEO')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleUploadToTC = async () => {
    if (selectedIds.length === 0) {
      toast.error('Selecciona al menos un paquete')
      return
    }

    // Reset state and open modal
    setUploadLogs([])
    setUploadStatus('running')
    setUploadResults(null)
    setShowUploadModal(true)
    setIsUploading(true)

    try {
      const response = await fetch('/api/seo/upload-to-tc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: selectedIds }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Error al subir a TC')
      }

      // Read SSE stream
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No se pudo leer la respuesta')
      }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.type === 'log' || data.type === 'info') {
                setUploadLogs(prev => [...prev, data.data])
              } else if (data.type === 'error') {
                setUploadLogs(prev => [...prev, `ERROR: ${data.data}`])
              } else if (data.type === 'complete') {
                const results = JSON.parse(data.data)
                setUploadResults(results)
                setUploadStatus('success')
                setUploadLogs(prev => [...prev, '', '========================================', `  Procesados: ${results.processed}`, `  Exitosos:   ${results.success}`, `  Errores:    ${results.errors}`, '========================================'])
              } else if (data.type === 'failed') {
                setUploadStatus('error')
                setUploadLogs(prev => [...prev, `FALLO: ${data.data}`])
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      setSelectedIds([])
      router.refresh()
    } catch (error) {
      setUploadStatus('error')
      setUploadLogs(prev => [...prev, `Error: ${error instanceof Error ? error.message : 'Error desconocido'}`])
    } finally {
      setIsUploading(false)
    }
  }

  const handleSitemapToggle = async (id: number, checked: boolean) => {
    try {
      const response = await fetch(`/api/seo/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_sitemap: checked }),
      })

      if (!response.ok) {
        throw new Error('Error al actualizar')
      }

      router.refresh()
    } catch (error) {
      toast.error('Error al actualizar sitemap')
    }
  }

  const handleEditOpen = (pkg: PackageWithSeo) => {
    setEditingPackage(pkg)
    setEditForm({
      seo_title: pkg.seo_title || '',
      seo_description: pkg.seo_description || '',
      seo_keywords: pkg.seo_keywords || '',
      meta_title: pkg.meta_title || '',
      meta_description: pkg.meta_description || '',
      image_alt: pkg.image_alt || '',
      include_sitemap: pkg.include_sitemap,
    })
  }

  const handleEditSave = async () => {
    if (!editingPackage) return

    setIsSaving(true)
    try {
      const response = await fetch(`/api/seo/${editingPackage.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      })

      if (!response.ok) {
        throw new Error('Error al guardar')
      }

      toast.success('SEO actualizado')
      setEditingPackage(null)
      router.refresh()
    } catch (error) {
      toast.error('Error al guardar cambios')
    } finally {
      setIsSaving(false)
    }
  }

  const handleLoadPrompt = async () => {
    setIsLoadingPrompt(true)
    try {
      const response = await fetch('/api/seo/config')
      const data = await response.json()
      setPromptTemplate(data.prompt_template || '')
    } catch (error) {
      toast.error('Error al cargar configuración')
    } finally {
      setIsLoadingPrompt(false)
    }
  }

  const handleSavePrompt = async () => {
    setIsLoadingPrompt(true)
    try {
      const response = await fetch('/api/seo/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt_template: promptTemplate }),
      })

      if (!response.ok) {
        throw new Error('Error al guardar')
      }

      toast.success('Prompt guardado')
      setShowPromptConfig(false)
    } catch (error) {
      toast.error('Error al guardar prompt')
    } finally {
      setIsLoadingPrompt(false)
    }
  }

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'generated':
        return <span className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded">Generado</span>
      case 'uploaded':
        return <span className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded">Subido</span>
      case 'upload_error':
        return <span className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded">Error</span>
      case 'uploading':
        return <span className="px-2 py-1 text-xs bg-yellow-100 text-yellow-700 rounded">Subiendo...</span>
      default:
        return <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">Pendiente</span>
    }
  }

  return (
    <>
      {/* Actions bar */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.length === filteredPackages.length && filteredPackages.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.length > 0 ? `${selectedIds.length} seleccionados` : `Seleccionar todos (${filteredPackages.length})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendiente</SelectItem>
              <SelectItem value="generated">Generado</SelectItem>
              <SelectItem value="uploaded">Subido</SelectItem>
              <SelectItem value="upload_error">Error</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPromptConfig(true)
              handleLoadPrompt()
            }}
          >
            <Settings className="h-4 w-4 mr-2" />
            Configurar Prompt
          </Button>

          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={selectedIds.length === 0 || isGenerating}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Generar SEO con IA
          </Button>

          <Button
            size="sm"
            onClick={handleUploadToTC}
            disabled={selectedIds.length === 0 || isUploading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Subir a TC
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-xs w-24">ID</TableHead>
            <TableHead className="text-xs">Título Paquete</TableHead>
            <TableHead className="text-xs">SEO Title</TableHead>
            <TableHead className="text-xs">Meta Title</TableHead>
            <TableHead className="text-xs">Meta Desc</TableHead>
            <TableHead className="text-xs w-24">Estado</TableHead>
            <TableHead className="text-xs w-20">Acciones</TableHead>
            <TableHead className="text-xs w-16">Sitemap</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPackages.map((pkg) => (
            <TableRow key={pkg.id}>
              <TableCell>
                <Checkbox
                  checked={selectedIds.includes(pkg.id)}
                  onCheckedChange={(checked) => handleSelect(pkg.id, checked as boolean)}
                />
              </TableCell>
              <TableCell className="text-xs font-mono">
                {pkg.tc_package_id}
              </TableCell>
              <TableCell>
                <span className="text-sm font-medium line-clamp-1">
                  {pkg.title}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {pkg.seo_title || '-'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {pkg.meta_title || '-'}
                </span>
              </TableCell>
              <TableCell>
                <span className="text-xs text-muted-foreground line-clamp-1">
                  {pkg.meta_description || '-'}
                </span>
              </TableCell>
              <TableCell>
                {getStatusBadge(pkg.seo_status)}
              </TableCell>
              <TableCell>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleEditOpen(pkg)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              </TableCell>
              <TableCell>
                <Checkbox
                  checked={pkg.include_sitemap}
                  onCheckedChange={(checked) => handleSitemapToggle(pkg.id, checked as boolean)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {filteredPackages.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {packages.length === 0 ? 'No hay paquetes activos' : 'No hay paquetes con ese estado'}
        </div>
      )}

      {/* Edit Modal */}
      <Dialog open={!!editingPackage} onOpenChange={() => setEditingPackage(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Editar SEO - {editingPackage?.title}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center gap-2">
              <Checkbox
                id="include_sitemap"
                checked={editForm.include_sitemap}
                onCheckedChange={(checked) => setEditForm(prev => ({ ...prev, include_sitemap: checked as boolean }))}
              />
              <label htmlFor="include_sitemap" className="text-sm font-medium">
                Incluir en Sitemap
              </label>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between">
                SEO Title
                <span className="text-muted-foreground">{(editForm.seo_title || '').length}/60</span>
              </label>
              <Input
                value={editForm.seo_title || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditForm(prev => ({ ...prev, seo_title: e.target.value }))}
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between">
                Meta Title
                <span className="text-muted-foreground">{(editForm.meta_title || '').length}/60</span>
              </label>
              <Input
                value={editForm.meta_title || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, meta_title: e.target.value }))}
                maxLength={60}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between">
                Meta Description
                <span className="text-muted-foreground">{(editForm.meta_description || '').length}/155</span>
              </label>
              <Textarea
                value={editForm.meta_description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm(prev => ({ ...prev, meta_description: e.target.value }))}
                maxLength={155}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium flex justify-between">
                SEO Description
                <span className="text-muted-foreground">{(editForm.seo_description || '').length}/160</span>
              </label>
              <Textarea
                value={editForm.seo_description || ''}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditForm(prev => ({ ...prev, seo_description: e.target.value }))}
                maxLength={160}
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Keywords (separadas por coma)</label>
              <Input
                value={editForm.seo_keywords || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, seo_keywords: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Image Alt (4-8 palabras)</label>
              <Input
                value={editForm.image_alt || ''}
                onChange={(e) => setEditForm(prev => ({ ...prev, image_alt: e.target.value }))}
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setEditingPackage(null)}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleEditSave} disabled={isSaving}>
                {isSaving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Guardar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Prompt Config Modal */}
      <Dialog open={showPromptConfig} onOpenChange={setShowPromptConfig}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuración de Prompt SEO</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="bg-muted/50 p-3 rounded-lg space-y-2">
              <p className="text-sm font-medium">Variables disponibles:</p>

              <div className="space-y-1 text-xs">
                <p><span className="text-muted-foreground">Info Básica:</span> <code>{'{title}'} {'{large_title}'} {'{destinations}'} {'{price}'} {'{currency}'} {'{nights}'} {'{adults}'} {'{children}'} {'{departure_date}'} {'{date_range}'} {'{themes}'}</code></p>

                <p><span className="text-muted-foreground">Origen:</span> <code>{'{origin_city}'} {'{origin_country}'}</code></p>

                <p><span className="text-muted-foreground">Hotel:</span> <code>{'{hotel_name}'} {'{hotel_category}'} {'{hotel_stars}'} {'{room_type}'} {'{board_type}'} {'{hotel_nights}'} {'{hotel_address}'}</code></p>

                <p><span className="text-muted-foreground">Vuelo:</span> <code>{'{airline}'} {'{airline_code}'} {'{flight_departure}'} {'{flight_arrival}'} {'{cabin_class}'} {'{baggage_info}'}</code></p>

                <p><span className="text-muted-foreground">Conteos:</span> <code>{'{hotels_count}'} {'{transfers_count}'} {'{flights_count}'}</code></p>

                <p><span className="text-muted-foreground">Inclusiones (Sí/No):</span> <code>{'{includes_flights}'} {'{includes_hotel}'} {'{includes_transfers}'} {'{includes_all_inclusive}'}</code></p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Prompt Template</label>
              <Textarea
                value={promptTemplate}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPromptTemplate(e.target.value)}
                rows={20}
                className="font-mono text-sm"
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPromptConfig(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSavePrompt} disabled={isLoadingPrompt}>
                {isLoadingPrompt ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-2" />
                )}
                Guardar Prompt
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Progress Modal */}
      <Dialog open={showUploadModal} onOpenChange={(open) => !isUploading && setShowUploadModal(open)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {uploadStatus === 'running' && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
              {uploadStatus === 'success' && <Check className="h-5 w-5 text-green-500" />}
              {uploadStatus === 'error' && <X className="h-5 w-5 text-red-500" />}
              Subiendo SEO a TravelCompositor
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Status banner */}
            <div className={`px-4 py-2 rounded-lg text-sm font-medium ${
              uploadStatus === 'running' ? 'bg-blue-100 text-blue-700' :
              uploadStatus === 'success' ? 'bg-green-100 text-green-700' :
              'bg-red-100 text-red-700'
            }`}>
              {uploadStatus === 'running' && 'Procesando paquetes...'}
              {uploadStatus === 'success' && `Completado: ${uploadResults?.success || 0} de ${uploadResults?.processed || 0} exitosos`}
              {uploadStatus === 'error' && 'El proceso falló'}
            </div>

            {/* Logs container */}
            <div className="bg-gray-900 rounded-lg p-4 h-[400px] overflow-y-auto font-mono text-sm">
              {uploadLogs.map((log, index) => (
                <div
                  key={index}
                  className={`whitespace-pre-wrap ${
                    log.includes('ERROR') || log.includes('FALLO') ? 'text-red-400' :
                    log.includes('Successfully') || log.includes('Exitosos') ? 'text-green-400' :
                    log.includes('========') ? 'text-yellow-400' :
                    log.includes('Processing package') || log.includes('Procesando') ? 'text-cyan-400' :
                    log.includes('Title:') ? 'text-purple-400' :
                    'text-gray-300'
                  }`}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>

            {/* Close button */}
            <div className="flex justify-end">
              <Button
                variant={uploadStatus === 'success' ? 'default' : 'outline'}
                onClick={() => setShowUploadModal(false)}
                disabled={isUploading}
              >
                {isUploading ? 'Procesando...' : 'Cerrar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
