'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Search,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Activity,
  User,
  Bot,
} from 'lucide-react'
import { toast } from 'sonner'

interface UnifiedLog {
  id: string
  created_at: string
  source: string
  action: string
  level: 'error' | 'warning' | 'info' | 'debug'
  message: string
  entity_type: string | null
  entity_id: number | null
  entity_label: string | null
  actor: string | null
  duration_ms: number | null
  origin: 'system' | 'sync' | 'package_sync' | 'notification' | 'ai'
  detail: Record<string, unknown> | null
}

interface Stats {
  last24h: number
  errors24h: number
  warnings24h: number
  bySource: Record<string, number>
}

const levelStyles: Record<string, string> = {
  error: 'bg-red-100 text-red-800 border-red-200',
  warning: 'bg-amber-100 text-amber-800 border-amber-200',
  info: 'bg-slate-100 text-slate-700 border-slate-200',
  debug: 'bg-slate-100 text-slate-500 border-slate-200',
}

const levelLabels: Record<string, string> = {
  error: 'Error',
  warning: 'Aviso',
  info: 'OK',
  debug: 'Debug',
}

const ORIGINS = [
  { value: 'all', label: 'Todo el sistema' },
  { value: 'system', label: 'Acciones de usuarios' },
  { value: 'sync', label: 'Sync con TC' },
  { value: 'package_sync', label: 'Cron e imports' },
  { value: 'notification', label: 'Notificaciones' },
  { value: 'ai', label: 'IA / Creativos' },
]

const RANGES = [
  { value: '1', label: 'Últimas 24 h' },
  { value: '7', label: 'Últimos 7 días' },
  { value: '30', label: 'Últimos 30 días' },
  { value: 'all', label: 'Todo' },
]

export default function LogsPage() {
  const [logs, setLogs] = useState<UnifiedLog[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [page, setPage] = useState(0)
  const [selectedLog, setSelectedLog] = useState<UnifiedLog | null>(null)

  const [origin, setOrigin] = useState('all')
  const [level, setLevel] = useState('all')
  const [range, setRange] = useState('7')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [autoRefresh, setAutoRefresh] = useState(false)

  const pageSize = 50
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
        origins: origin,
        level,
      })
      if (search) params.set('search', search)
      if (range !== 'all') {
        const since = new Date()
        since.setDate(since.getDate() - parseInt(range))
        params.set('since', since.toISOString())
      }

      const response = await fetch(`/api/logs?${params}`)
      const data = await response.json()

      if (response.ok) {
        setLogs(data.logs || [])
        setTotal(data.total || 0)
        setTruncated(!!data.truncated)
        setStats(data.stats || null)
      } else {
        toast.error('Error al cargar la actividad')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [origin, level, range, search, page])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current)
    if (autoRefresh) timerRef.current = setInterval(fetchLogs, 15000)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [autoRefresh, fetchLogs])

  const handleSearch = () => {
    setPage(0)
    setSearch(searchInput)
  }

  const handleCleanup = async () => {
    if (!confirm('¿Eliminar eventos de más de 30 días? No toca notificaciones ni historial de IA.')) return
    try {
      const response = await fetch('/api/logs?days=30', { method: 'DELETE' })
      const data = await response.json()
      if (response.ok) {
        toast.success(`${data.total || 0} eventos eliminados`)
        fetchLogs()
      } else {
        toast.error('Error al limpiar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })

  const formatDuration = (ms: number | null) => {
    if (!ms) return null
    return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Actividad del sistema</h1>
          <p className="text-muted-foreground">
            Todo lo que pasa en hub: acciones de usuarios, sincronizaciones con TC, cron, notificaciones e IA
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className={`h-4 w-4 mr-2 ${autoRefresh ? 'animate-pulse' : ''}`} />
            {autoRefresh ? 'En vivo' : 'En vivo'}
          </Button>
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

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Eventos (24 h)</p>
              <p className="text-2xl font-bold">{stats.last24h}</p>
            </CardContent>
          </Card>
          <Card className={stats.errors24h > 0 ? 'border-red-200' : undefined}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Errores (24 h)</p>
              <p className={`text-2xl font-bold ${stats.errors24h > 0 ? 'text-red-600' : ''}`}>
                {stats.errors24h}
              </p>
            </CardContent>
          </Card>
          <Card className={stats.warnings24h > 0 ? 'border-amber-200' : undefined}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Avisos (24 h)</p>
              <p className={`text-2xl font-bold ${stats.warnings24h > 0 ? 'text-amber-600' : ''}`}>
                {stats.warnings24h}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground mb-1">Por área (24 h)</p>
              <div className="flex flex-wrap gap-1">
                {Object.entries(stats.bySource).length === 0 && (
                  <span className="text-sm text-muted-foreground">Sin actividad</span>
                )}
                {Object.entries(stats.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 4)
                  .map(([src, n]) => (
                    <Badge key={src} variant="secondary" className="text-xs">
                      {src} {n}
                    </Badge>
                  ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[220px]">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar por texto, ID de paquete, cupo o usuario..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                />
                <Button variant="secondary" onClick={handleSearch}>
                  <Search className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Select value={origin} onValueChange={(v) => { setOrigin(v); setPage(0) }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Área" />
              </SelectTrigger>
              <SelectContent>
                {ORIGINS.map(o => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={level} onValueChange={(v) => { setLevel(v); setPage(0) }}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Nivel" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="error">Errores</SelectItem>
                <SelectItem value="warning">Avisos</SelectItem>
                <SelectItem value="info">Normales</SelectItem>
              </SelectContent>
            </Select>

            <Select value={range} onValueChange={(v) => { setRange(v); setPage(0) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                {RANGES.map(r => (
                  <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {total} evento(s)
            {truncated && (
              <span className="ml-2 text-xs font-normal text-amber-600">
                (hay más de los que entran en la ventana: acotá el período)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[160px]">Fecha</TableHead>
                <TableHead className="w-[90px]">Nivel</TableHead>
                <TableHead className="w-[120px]">Área</TableHead>
                <TableHead>Qué pasó</TableHead>
                <TableHead className="w-[220px]">Sobre</TableHead>
                <TableHead className="w-[180px]">Quién</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay eventos para estos filtros
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => {
                  const LevelIcon =
                    log.level === 'error' ? AlertCircle : log.level === 'warning' ? AlertTriangle : CheckCircle2
                  return (
                    <TableRow
                      key={log.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => setSelectedLog(log)}
                    >
                      <TableCell className="font-mono text-xs">{formatDate(log.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={levelStyles[log.level]}>
                          <LevelIcon className="h-3 w-3 mr-1" />
                          {levelLabels[log.level]}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">{log.source}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {log.message}
                        {log.duration_ms ? (
                          <span className="text-xs text-muted-foreground ml-2">
                            ({formatDuration(log.duration_ms)})
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-[220px]">
                        {log.entity_label || (log.entity_id ? `#${log.entity_id}` : '-')}
                      </TableCell>
                      <TableCell className="text-xs">
                        {log.actor ? (
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {log.actor}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Bot className="h-3 w-3" />
                            automático
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
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
                  onClick={() => setPage(p => p + 1)}
                  disabled={page + 1 >= totalPages}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalle del evento</DialogTitle>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Fecha</p>
                  <p className="font-mono">{formatDate(selectedLog.created_at)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Evento</p>
                  <p className="font-mono">{selectedLog.action}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Área</p>
                  <p>{selectedLog.source}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Quién</p>
                  <p>{selectedLog.actor || 'automático (cron / sistema)'}</p>
                </div>
                {selectedLog.entity_label && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Sobre</p>
                    <p>{selectedLog.entity_label}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="text-muted-foreground text-sm mb-1">Mensaje</p>
                <p className="text-sm">{selectedLog.message}</p>
              </div>

              {selectedLog.detail && (
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Detalle</p>
                  <pre className="bg-muted p-3 rounded text-xs overflow-x-auto max-h-[300px]">
                    {JSON.stringify(selectedLog.detail, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
