'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DatePicker } from '@/components/ui/date-picker'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Calculator,
  Palette,
  Megaphone,
  Clock,
  Filter,
  X,
} from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type {
  ManualQuoteMetrics,
  DesignMetrics,
  MarketingMetrics,
} from '@/app/(dashboard)/rendimiento/page'

interface Props {
  manualQuote: ManualQuoteMetrics
  design: DesignMetrics
  marketing: MarketingMetrics
  dateFrom?: string
  dateTo?: string
}

function formatDate(dateStr: string): string {
  try {
    return format(new Date(dateStr), 'dd/MM/yyyy HH:mm', { locale: es })
  } catch {
    return dateStr
  }
}

function formatResponseTime(hours: number | null): string {
  if (hours === null) return '-'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 24) return `${hours.toFixed(1)} h`
  const days = Math.floor(hours / 24)
  const remainingHours = Math.round(hours % 24)
  return `${days}d ${remainingHours}h`
}

export function RendimientoMetrics({
  manualQuote,
  design,
  marketing,
  dateFrom,
  dateTo,
}: Props) {
  const router = useRouter()
  const [from, setFrom] = useState(dateFrom || '')
  const [to, setTo] = useState(dateTo || '')

  const applyFilters = () => {
    const params = new URLSearchParams()
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    router.push(`/rendimiento?${params.toString()}`)
  }

  const clearFilters = () => {
    setFrom('')
    setTo('')
    router.push('/rendimiento')
  }

  const hasFilters = from || to

  // Quick filter presets
  const setPreset = (preset: 'week' | 'month' | '3months') => {
    const now = new Date()
    let fromDate: Date

    switch (preset) {
      case 'week':
        fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case 'month':
        fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      case '3months':
        fromDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
        break
    }

    const formatToISO = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }

    const params = new URLSearchParams()
    params.set('from', formatToISO(fromDate))
    params.set('to', formatToISO(now))
    router.push(`/rendimiento?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Date Filters */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Filter className="h-4 w-4" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Desde</label>
              <DatePicker
                value={from}
                onChange={setFrom}
                placeholder="Fecha inicio"
                className="w-[200px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm text-muted-foreground">Hasta</label>
              <DatePicker
                value={to}
                onChange={setTo}
                placeholder="Fecha fin"
                className="w-[200px]"
              />
            </div>
            <Button onClick={applyFilters}>Aplicar</Button>
            {hasFilters && (
              <Button variant="ghost" onClick={clearFilters}>
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm" onClick={() => setPreset('week')}>
                Última semana
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreset('month')}>
                Último mes
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPreset('3months')}>
                Últimos 3 meses
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Manual Quote Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Cotización Manual
            </CardTitle>
            <Calculator className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{manualQuote.total}</div>
            <p className="text-xs text-muted-foreground">completadas</p>
            <div className="mt-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">
                {manualQuote.avgResponseTimeHours !== null
                  ? formatResponseTime(manualQuote.avgResponseTimeHours)
                  : 'Sin datos'}
              </span>
              <span className="text-xs text-muted-foreground">
                tiempo promedio
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Design Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Diseño</CardTitle>
            <Palette className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{design.completed}</div>
              <span className="text-sm text-muted-foreground">
                / {design.total} solicitudes
              </span>
            </div>
            <p className="text-xs text-muted-foreground">completadas</p>
            <div className="mt-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-medium">
                {design.avgResponseTimeHours !== null
                  ? formatResponseTime(design.avgResponseTimeHours)
                  : 'Sin datos'}
              </span>
              <span className="text-xs text-muted-foreground">
                tiempo promedio
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Marketing Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Marketing</CardTitle>
            <Megaphone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{marketing.completed}</div>
              <span className="text-sm text-muted-foreground">
                / {marketing.total} enviados
              </span>
            </div>
            <p className="text-xs text-muted-foreground">completados</p>
            <div className="mt-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-medium">
                {marketing.avgResponseTimeHours !== null
                  ? formatResponseTime(marketing.avgResponseTimeHours)
                  : 'Sin datos'}
              </span>
              <span className="text-xs text-muted-foreground">
                tiempo promedio
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detail Tabs */}
      <Tabs defaultValue="manual-quote" className="w-full">
        <TabsList>
          <TabsTrigger value="manual-quote">
            <Calculator className="h-4 w-4 mr-2" />
            Cotización Manual ({manualQuote.total})
          </TabsTrigger>
          <TabsTrigger value="design">
            <Palette className="h-4 w-4 mr-2" />
            Diseño ({design.total})
          </TabsTrigger>
          <TabsTrigger value="marketing">
            <Megaphone className="h-4 w-4 mr-2" />
            Marketing ({marketing.total})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="manual-quote">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de Cotizaciones Manuales
              </CardTitle>
            </CardHeader>
            <CardContent>
              {manualQuote.items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay cotizaciones manuales en el período seleccionado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TC ID</TableHead>
                      <TableHead>Paquete</TableHead>
                      <TableHead>Notificado</TableHead>
                      <TableHead>Completado</TableHead>
                      <TableHead className="text-right">Tiempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {manualQuote.items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="font-mono">
                          #{item.tc_package_id}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {item.title}
                        </TableCell>
                        <TableCell>{formatDate(item.notified_at)}</TableCell>
                        <TableCell>{formatDate(item.completed_at)}</TableCell>
                        <TableCell className="text-right">
                          <Badge
                            variant={
                              item.responseTimeHours < 24
                                ? 'default'
                                : item.responseTimeHours < 48
                                ? 'secondary'
                                : 'destructive'
                            }
                          >
                            {formatResponseTime(item.responseTimeHours)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="design">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de Solicitudes de Diseño
              </CardTitle>
            </CardHeader>
            <CardContent>
              {design.items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay solicitudes de diseño en el período seleccionado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TC ID</TableHead>
                      <TableHead>Paquete</TableHead>
                      <TableHead>Razón</TableHead>
                      <TableHead>Prioridad</TableHead>
                      <TableHead>Asignado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Solicitado</TableHead>
                      <TableHead>Completado</TableHead>
                      <TableHead className="text-right">Tiempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {design.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">
                          #{item.tc_package_id}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {item.package_title}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {item.reason}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.priority === 'high'
                                ? 'destructive'
                                : item.priority === 'normal'
                                ? 'default'
                                : 'secondary'
                            }
                          >
                            {item.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>{item.assigned_to || '-'}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === 'completed'
                                ? 'default'
                                : item.status === 'in_progress'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{formatDate(item.created_at)}</TableCell>
                        <TableCell>
                          {item.completed_at ? (
                            formatDate(item.completed_at)
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.responseTimeHours !== null ? (
                            <Badge
                              variant={
                                item.responseTimeHours < 24
                                  ? 'default'
                                  : item.responseTimeHours < 48
                                  ? 'secondary'
                                  : 'destructive'
                              }
                            >
                              {formatResponseTime(item.responseTimeHours)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="marketing">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Historial de Marketing
              </CardTitle>
            </CardHeader>
            <CardContent>
              {marketing.items.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No hay paquetes de marketing en el período seleccionado
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>TC ID</TableHead>
                      <TableHead>Paquete</TableHead>
                      <TableHead>Destinos</TableHead>
                      <TableHead>Precio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Enviado</TableHead>
                      <TableHead>Completado</TableHead>
                      <TableHead className="text-right">Tiempo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {marketing.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono">
                          #{item.tc_package_id}
                        </TableCell>
                        <TableCell className="max-w-[150px] truncate">
                          {item.title}
                        </TableCell>
                        <TableCell className="max-w-[120px] truncate">
                          {item.destinations || '-'}
                        </TableCell>
                        <TableCell>
                          {item.current_price_per_pax
                            ? `${item.currency} ${item.current_price_per_pax.toLocaleString('es-AR')}`
                            : '-'}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              item.status === 'published'
                                ? 'default'
                                : item.status === 'in_marketing'
                                ? 'secondary'
                                : 'outline'
                            }
                          >
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDate(item.send_to_marketing_at)}
                        </TableCell>
                        <TableCell>
                          {item.marketing_completed_at ? (
                            formatDate(item.marketing_completed_at)
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {item.responseTimeHours !== null ? (
                            <Badge
                              variant={
                                item.responseTimeHours < 24
                                  ? 'default'
                                  : item.responseTimeHours < 48
                                  ? 'secondary'
                                  : 'destructive'
                              }
                            >
                              {formatResponseTime(item.responseTimeHours)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
