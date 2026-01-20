'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
  DialogDescription,
  DialogFooter,
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
import {
  RefreshCw,
  Download,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ArrowLeft,
  Plane
} from 'lucide-react'
import Link from 'next/link'

interface TCTransport {
  id: string
  baseId: string
  name: string
  active: boolean
  airlineCode?: string
  transportType: string
  currency: string
  startDate: string
  endDate: string
  segments?: Array<{
    departureLocationCode: string
    arrivalLocationCode: string
  }>
  modalities?: Array<{
    code: string
    inventories?: Array<{
      quantity: number
    }>
  }>
  localFlight?: {
    tc_transport_id: string
    base_id: string
    name: string
    sync_status: string
  } | null
  syncStatus: 'exists' | 'new'
}

interface ImportResponse {
  transports: TCTransport[]
  total: number
  existing: number
  new: number
}

interface ImportResult {
  success: boolean
  results: {
    imported: number
    updated: number
    skipped: number
    deleted: number
    errors: string[]
  }
  message: string
}

export function ImportFlightsClient() {
  const [loading, setLoading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [transports, setTransports] = useState<TCTransport[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [stats, setStats] = useState<{ total: number; existing: number; new: number } | null>(null)
  const [importMode, setImportMode] = useState<'sync' | 'replace'>('sync')
  const [deleteUnmatched, setDeleteUnmatched] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<'import' | 'delete' | null>(null)

  // Fetch transports from TC
  const fetchTransports = async () => {
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/flights/import')
      const data: ImportResponse = await response.json()

      if (!response.ok) {
        throw new Error(data.transports ? 'Error fetching transports' : (data as { error?: string }).error || 'Unknown error')
      }

      setTransports(data.transports)
      setStats({ total: data.total, existing: data.existing, new: data.new })
      // Pre-select new transports
      setSelectedIds(new Set(data.transports.filter(t => t.syncStatus === 'new').map(t => t.id)))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error fetching transports')
    } finally {
      setLoading(false)
    }
  }

  // Import selected transports
  const handleImport = async () => {
    setConfirmDialog(null)
    setImporting(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/flights/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transportIds: selectedIds.size > 0 ? Array.from(selectedIds) : undefined,
          mode: importMode,
          deleteUnmatched,
        }),
      })

      const data: ImportResult = await response.json()

      if (!response.ok) {
        throw new Error((data as { error?: string }).error || 'Error importing transports')
      }

      setResult(data)
      // Refresh the list
      await fetchTransports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error importing transports')
    } finally {
      setImporting(false)
    }
  }

  // Delete all local flights
  const handleDeleteAll = async () => {
    setConfirmDialog(null)
    setDeleting(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/flights/import', {
        method: 'DELETE',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error deleting flights')
      }

      setResult({
        success: true,
        results: {
          imported: 0,
          updated: 0,
          skipped: 0,
          deleted: data.deleted,
          errors: [],
        },
        message: data.message,
      })
      // Refresh the list
      await fetchTransports()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting flights')
    } finally {
      setDeleting(false)
    }
  }

  // Toggle selection
  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  // Toggle all
  const toggleAll = () => {
    if (selectedIds.size === transports.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(transports.map(t => t.id)))
    }
  }

  // Load transports on mount
  useEffect(() => {
    fetchTransports()
  }, [])

  // Get route from segments
  const getRoute = (transport: TCTransport) => {
    if (!transport.segments || transport.segments.length === 0) return '-'
    const first = transport.segments[0]
    const last = transport.segments[transport.segments.length - 1]
    return `${first.departureLocationCode} → ${last.arrivalLocationCode}`
  }

  // Get total inventory
  const getTotalInventory = (transport: TCTransport) => {
    if (!transport.modalities) return 0
    return transport.modalities.reduce((sum, mod) => {
      if (!mod.inventories) return sum
      return sum + mod.inventories.reduce((invSum, inv) => invSum + inv.quantity, 0)
    }, 0)
  }

  return (
    <div className="space-y-6">
      {/* Back button and actions */}
      <div className="flex justify-between items-center">
        <Button variant="ghost" asChild>
          <Link href="/flights">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Volver a vuelos
          </Link>
        </Button>

        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchTransports} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Recargar
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirmDialog('delete')}
            disabled={loading || importing || deleting}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Borrar todos los vuelos locales
          </Button>
        </div>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
              <CardDescription>Vuelos en TravelCompositor</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-green-600">{stats.new}</CardTitle>
              <CardDescription>Nuevos (no importados)</CardDescription>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-2xl text-blue-600">{stats.existing}</CardTitle>
              <CardDescription>Ya existentes en BD local</CardDescription>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Error alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Result alert */}
      {result && (
        <Alert variant={result.success ? 'default' : 'destructive'}>
          {result.success ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          <AlertTitle>{result.success ? 'Operación completada' : 'Error'}</AlertTitle>
          <AlertDescription>
            <p>{result.message}</p>
            {result.results.errors.length > 0 && (
              <ul className="mt-2 list-disc list-inside">
                {result.results.errors.slice(0, 5).map((err, i) => (
                  <li key={i} className="text-sm">{err}</li>
                ))}
                {result.results.errors.length > 5 && (
                  <li className="text-sm">... y {result.results.errors.length - 5} errores más</li>
                )}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Import options */}
      <Card>
        <CardHeader>
          <CardTitle>Opciones de importación</CardTitle>
          <CardDescription>
            Configura cómo deseas importar los vuelos desde TravelCompositor
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium">Modo:</label>
            <Select value={importMode} onValueChange={(v: 'sync' | 'replace') => setImportMode(v)}>
              <SelectTrigger className="w-[300px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sync">Sincronizar (actualizar existentes, crear nuevos)</SelectItem>
                <SelectItem value="replace">Reemplazar (borrar todo y reimportar)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="deleteUnmatched"
              checked={deleteUnmatched}
              onCheckedChange={(checked) => setDeleteUnmatched(checked === true)}
            />
            <label htmlFor="deleteUnmatched" className="text-sm">
              Eliminar vuelos locales que no existen en TravelCompositor
            </label>
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              onClick={() => setConfirmDialog('import')}
              disabled={loading || importing || deleting || transports.length === 0}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Download className="h-4 w-4 mr-2" />
              )}
              {selectedIds.size > 0
                ? `Importar ${selectedIds.size} seleccionados`
                : 'Importar todos'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transports table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Vuelos en TravelCompositor ({transports.length})
          </CardTitle>
          <CardDescription>
            Selecciona los vuelos que deseas importar a la base de datos local
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Cargando vuelos de TravelCompositor...</span>
            </div>
          ) : transports.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No se encontraron vuelos en TravelCompositor
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox
                        checked={selectedIds.size === transports.length}
                        onCheckedChange={toggleAll}
                      />
                    </TableHead>
                    <TableHead>ID TC</TableHead>
                    <TableHead>Base ID</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Ruta</TableHead>
                    <TableHead>Fechas</TableHead>
                    <TableHead>Cupos</TableHead>
                    <TableHead>Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transports.map((transport) => (
                    <TableRow key={transport.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(transport.id)}
                          onCheckedChange={() => toggleSelection(transport.id)}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs">{transport.id}</TableCell>
                      <TableCell className="font-mono text-xs">{transport.baseId}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {transport.name}
                          {!transport.active && (
                            <Badge variant="secondary">Inactivo</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono">{getRoute(transport)}</TableCell>
                      <TableCell className="text-xs">
                        {transport.startDate} → {transport.endDate}
                      </TableCell>
                      <TableCell>{getTotalInventory(transport)}</TableCell>
                      <TableCell>
                        {transport.syncStatus === 'exists' ? (
                          <Badge variant="outline" className="text-blue-600 border-blue-600">
                            Existente
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-green-600 border-green-600">
                            Nuevo
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Confirm import dialog */}
      <Dialog open={confirmDialog === 'import'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar importación</DialogTitle>
            <DialogDescription>
              {importMode === 'replace' ? (
                <>
                  <strong className="text-destructive">Atención:</strong> Esta acción eliminará TODOS los vuelos
                  existentes en la base de datos local y los reemplazará con los de TravelCompositor.
                </>
              ) : (
                <>
                  Se importarán {selectedIds.size > 0 ? selectedIds.size : transports.length} vuelos.
                  Los vuelos existentes serán actualizados y los nuevos serán creados.
                  {deleteUnmatched && (
                    <span className="text-destructive block mt-2">
                      Los vuelos locales que no existan en TC serán eliminados.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancelar
            </Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Confirmar importación
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={confirmDialog === 'delete'} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar eliminación</DialogTitle>
            <DialogDescription>
              <strong className="text-destructive">Atención:</strong> Esta acción eliminará TODOS los vuelos
              de la base de datos local. Esta operación no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDeleteAll} disabled={deleting}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Eliminar todos los vuelos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
