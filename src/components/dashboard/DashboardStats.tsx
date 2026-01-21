'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Plane, Users, ShoppingCart, TrendingUp, AlertTriangle, Loader2, Building2 } from 'lucide-react'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'

interface SupplierStats {
  supplier_id: number
  supplier_name: string
  flights_count: number
  total_quotas: number
  sold_quotas: number
  remaining_quotas: number
  occupancy_rate: number
}

interface Supplier {
  id: number
  name: string
}

interface DashboardData {
  stats: {
    flightsCount: number
    totalQuotas: number
    soldQuotas: number
    remainingQuotas: number
    occupancyRate: number
  }
  statsBySupplier: SupplierStats[]
  expiringQuotas: Array<{
    id: number
    name: string
    base_id: string
    tc_transport_id: string
    start_date: string
    release_date: string
    release_contract: number
    quantity: number
    sold: number
    remaining: number
    daysUntilRelease: number
    supplier_id: number | null
    supplier_name: string
  }>
}

export function DashboardStats() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState<string>('')
  const [endDate, setEndDate] = useState<string>('')
  const [supplierId, setSupplierId] = useState<string>('')
  const [suppliers, setSuppliers] = useState<Supplier[]>([])

  // Fetch suppliers on mount
  useEffect(() => {
    const fetchSuppliers = async () => {
      try {
        const response = await fetch('/api/suppliers')
        if (response.ok) {
          const result = await response.json()
          setSuppliers(result.suppliers || [])
        }
      } catch (error) {
        console.error('Error fetching suppliers:', error)
      }
    }
    fetchSuppliers()
  }, [])

  const fetchStats = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('startDate', startDate)
      if (endDate) params.set('endDate', endDate)
      if (supplierId && supplierId !== 'all') params.set('supplierId', supplierId)

      const response = await fetch(`/api/dashboard/stats?${params.toString()}`)
      if (response.ok) {
        const result = await response.json()
        setData(result)
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const handleFilter = () => {
    fetchStats()
  }

  const clearFilters = () => {
    setStartDate('')
    setEndDate('')
    setSupplierId('')
    setTimeout(fetchStats, 0)
  }

  const stats = data?.stats

  const cards = [
    {
      title: 'Cupos (Ida+Vuelta)',
      value: stats?.flightsCount || 0,
      icon: Plane,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
      description: 'Pares de vuelos activos',
    },
    {
      title: 'Cupos Totales',
      value: stats?.totalQuotas || 0,
      icon: Users,
      color: 'text-purple-600',
      bgColor: 'bg-purple-100',
      description: 'Asientos disponibles',
    },
    {
      title: 'Cupos Vendidos',
      value: stats?.soldQuotas || 0,
      icon: ShoppingCart,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
      description: 'Asientos reservados',
    },
    {
      title: 'Ocupación',
      value: `${stats?.occupancyRate || 0}%`,
      icon: TrendingUp,
      color: 'text-orange-600',
      bgColor: 'bg-orange-100',
      description: `${stats?.remainingQuotas || 0} restantes`,
    },
  ]

  const getDaysUntilExpiryBadge = (days: number) => {
    if (days <= 2) {
      return <Badge variant="destructive">{days} días</Badge>
    }
    if (days <= 4) {
      return <Badge className="bg-orange-500">{days} días</Badge>
    }
    return <Badge variant="secondary">{days} días</Badge>
  }

  const getOccupancyColor = (rate: number) => {
    if (rate >= 80) return 'text-green-600'
    if (rate >= 50) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getProgressColor = (rate: number) => {
    if (rate >= 80) return 'bg-green-500'
    if (rate >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label>Proveedor</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todos los proveedores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id.toString()}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fecha desde</Label>
              <DatePicker
                value={startDate}
                onChange={setStartDate}
                placeholder="Fecha inicio"
              />
            </div>
            <div className="space-y-2">
              <Label>Fecha hasta</Label>
              <DatePicker
                value={endDate}
                onChange={setEndDate}
                placeholder="Fecha fin"
              />
            </div>
            <Button onClick={handleFilter} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Filtrar
            </Button>
            {(startDate || endDate || supplierId) && (
              <Button variant="outline" onClick={clearFilters}>
                Limpiar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Cards de estadísticas */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {cards.map((card) => (
              <Card key={card.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {card.title}
                  </CardTitle>
                  <div className={`${card.bgColor} ${card.color} p-2 rounded-lg`}>
                    <card.icon className="h-4 w-4" />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabla de cupos por proveedor */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-500" />
                Cupos por Proveedor
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.statsBySupplier && data.statsBySupplier.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Proveedor</TableHead>
                      <TableHead className="text-right">Vuelos</TableHead>
                      <TableHead className="text-right">Totales</TableHead>
                      <TableHead className="text-right">Vendidos</TableHead>
                      <TableHead className="text-right">Restantes</TableHead>
                      <TableHead className="w-[150px]">Ocupación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.statsBySupplier.map((supplier) => (
                      <TableRow key={supplier.supplier_id}>
                        <TableCell className="font-medium">
                          {supplier.supplier_name}
                        </TableCell>
                        <TableCell className="text-right">
                          {supplier.flights_count}
                        </TableCell>
                        <TableCell className="text-right">
                          {supplier.total_quotas}
                        </TableCell>
                        <TableCell className="text-right text-green-600">
                          {supplier.sold_quotas}
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {supplier.remaining_quotas}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Progress
                              value={supplier.occupancy_rate}
                              className="h-2 flex-1"
                            />
                            <span className={`text-sm font-medium ${getOccupancyColor(supplier.occupancy_rate)}`}>
                              {supplier.occupancy_rate}%
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No hay datos de proveedores disponibles
                </p>
              )}
            </CardContent>
          </Card>

          {/* Tabla de cupos por vencer */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                Cupos por vencer (próximos 10 días)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {data?.expiringQuotas && data.expiringQuotas.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vuelo</TableHead>
                      <TableHead>Proveedor</TableHead>
                      <TableHead>TC ID</TableHead>
                      <TableHead>Salida</TableHead>
                      <TableHead>Vencimiento</TableHead>
                      <TableHead className="text-right">Totales</TableHead>
                      <TableHead className="text-right">Vendidos</TableHead>
                      <TableHead className="text-right">Restantes</TableHead>
                      <TableHead className="text-center">Días</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.expiringQuotas.map((flight) => (
                      <TableRow key={flight.id}>
                        <TableCell className="font-medium">
                          <a
                            href={`/flights/${flight.id}`}
                            className="hover:underline text-blue-600"
                          >
                            {flight.name}
                          </a>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {flight.supplier_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground font-mono text-xs">
                          {flight.tc_transport_id || flight.base_id}
                        </TableCell>
                        <TableCell>
                          {format(new Date(flight.start_date), 'dd MMM', { locale: es })}
                        </TableCell>
                        <TableCell className="text-orange-600 font-medium">
                          {format(new Date(flight.release_date), 'dd MMM', { locale: es })}
                        </TableCell>
                        <TableCell className="text-right">{flight.quantity}</TableCell>
                        <TableCell className="text-right">{flight.sold}</TableCell>
                        <TableCell className="text-right font-semibold text-orange-600">
                          {flight.remaining}
                        </TableCell>
                        <TableCell className="text-center">
                          {getDaysUntilExpiryBadge(flight.daysUntilRelease)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="text-muted-foreground text-center py-8">
                  No hay cupos por vencer en los próximos 10 días
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
