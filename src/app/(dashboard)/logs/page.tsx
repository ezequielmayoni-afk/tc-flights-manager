'use client'

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
} from '@/components/ui/dialog'
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react'
import { toast } from 'sonner'

// Estructura real de sync_logs en Supabase
interface LogEntry {
  id: number
  entity_type: string
  entity_id: number
  action: 'create' | 'update' | 'delete'
  direction: 'push' | 'pull'
  status: 'success' | 'error'
  request_payload: Record<string, unknown> | null
  response_payload: Record<string, unknown> | null
  error_message: string | null
  created_by: string | null
  created_at: string
}

const statusStyles = {
  success: 'bg-green-100 text-green-800 border-green-200',
  error: 'bg-red-100 text-red-800 border-red-200',
}

const statusLabels = {
  success: 'OK',
  error: 'Error',
}

const actionLabels: Record<string, string> = {
  create: 'Crear',
  update: 'Actualizar',
  delete: 'Eliminar',
}

const directionLabels: Record<string, string> = {
  push: 'Enviar a TC',
  pull: 'Recibir de TC',
}

const entityLabels: Record<string, string> = {
  flight: 'Vuelo',
  modality: 'Modalidad',
  inventory: 'Inventario',
}

export default function LogsPage() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selectedLog, setSelectedLog] = useState<LogEntry | null>(null)

  // Filters
  const [status, setStatus] = useState('all')
  const [entityType, setEntityType] = useState('all')
  const [search, setSearch] = useState('')

  const pageSize = 50

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      })

      if (status !== 'all') params.set('status', status)
      if (entityType !== 'all') params.set('entity_type', entityType)
      if (search) params.set('search', search)

      const response = await fetch(`/api/logs?${params}`)
      const data = await response.json()

      if (response.ok) {
        setLogs(data.logs || [])
        setTotal(data.total || 0)
      } else {
        toast.error('Error al cargar logs')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [status, entityType, search, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const handleSearch = () => {
    setPage(0)
    fetchLogs()
  }

  const handleCleanup = async () => {
    if (!confirm('¿Eliminar logs de más de 30 días?')) return

    try {
      const response = await fetch('/api/logs?days=30', { method: 'DELETE' })
      const data = await response.json()

      if (response.ok) {
        toast.success(`${data.deleted || 0} logs eliminados`)
        fetchLogs()
      } else {
        toast.error('Error al limpiar logs')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Logs de Sincronización</h1>
          <p className="text-muted-foreground">
            Registro de sincronizaciones con TravelCompositor
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchLogs} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          <Button variant="destructive" onClick={handleCleanup}>
            <Trash2 className="h-4 w-4 mr-2" />
            Limpiar (+30 días)
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar en mensajes de error..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="secondary" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Estado" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Exitoso</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={entityType} onValueChange={(v) => { setEntityType(v); setPage(0) }}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="flight">Vuelos</SelectItem>
                <SelectItem value="modality">Modalidades</SelectItem>
                <SelectItem value="inventory">Inventario</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {total} log(s) encontrado(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">Fecha</TableHead>
                <TableHead className="w-[100px]">Estado</TableHead>
                <TableHead className="w-[120px]">Tipo</TableHead>
                <TableHead className="w-[120px]">Acción</TableHead>
                <TableHead>Mensaje de Error</TableHead>
                <TableHead className="w-[100px]">Entity ID</TableHead>
                <TableHead className="w-[100px]">Dirección</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No hay logs para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const StatusIcon = log.status === 'success' ? CheckCircle2 : AlertCircle
                  const DirectionIcon = log.direction === 'push' ? ArrowUpCircle : ArrowDownCircle
                  return (
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
                          className={statusStyles[log.status] || statusStyles.error}
                        >
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {statusLabels[log.status] || log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entityLabels[log.entity_type] || log.entity_type}
                      </TableCell>
                      <TableCell className="text-sm">
                        {actionLabels[log.action] || log.action}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate text-sm text-muted-foreground">
                        {log.error_message || '-'}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        #{log.entity_id}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          <DirectionIcon className="h-3 w-3 mr-1" />
                          {log.direction === 'push' ? 'Push' : 'Pull'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  )
                })
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
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedLog && (
                <>
                  <Badge
                    variant="outline"
                    className={statusStyles[selectedLog.status]}
                  >
                    {statusLabels[selectedLog.status]}
                  </Badge>
                  <span className="font-normal text-muted-foreground">
                    {formatDate(selectedLog.created_at)}
                  </span>
                </>
              )}
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <div className="space-y-4">
              {selectedLog.error_message && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Mensaje de Error
                  </h4>
                  <p className="text-sm bg-red-50 text-red-800 p-3 rounded-lg">
                    {selectedLog.error_message}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Tipo de Entidad
                  </h4>
                  <p className="text-sm">
                    {entityLabels[selectedLog.entity_type] || selectedLog.entity_type}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    ID de Entidad
                  </h4>
                  <p className="text-sm font-mono">#{selectedLog.entity_id}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Acción
                  </h4>
                  <p className="text-sm">{actionLabels[selectedLog.action] || selectedLog.action}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Dirección
                  </h4>
                  <p className="text-sm">{directionLabels[selectedLog.direction] || selectedLog.direction}</p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Request Payload
                </h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-[200px]">
                  {selectedLog.request_payload && Object.keys(selectedLog.request_payload).length > 0
                    ? JSON.stringify(selectedLog.request_payload, null, 2)
                    : 'Sin datos de request'}
                </pre>
              </div>

              <div>
                <h4 className="text-sm font-medium text-muted-foreground mb-1">
                  Response Payload
                </h4>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-x-auto max-h-[200px]">
                  {selectedLog.response_payload && Object.keys(selectedLog.response_payload).length > 0
                    ? JSON.stringify(selectedLog.response_payload, null, 2)
                    : 'Sin datos de response'}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
