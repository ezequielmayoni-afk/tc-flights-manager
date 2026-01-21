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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  RefreshCw,
  Search,
  ChevronLeft,
  ChevronRight,
  Users,
  DollarSign,
  Ticket,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { DatePicker } from '@/components/ui/date-picker'

interface Reservation {
  id: number
  booking_reference: string
  tc_service_id: string
  tc_transport_id: string | null
  provider: string
  provider_description: string
  flight_id: number | null
  status: 'confirmed' | 'modified' | 'cancelled'
  adults: number
  children: number
  infants: number
  total_passengers: number
  total_amount: number | null
  currency: string
  travel_date: string | null
  reservation_date: string
  modification_date: string | null
  cancellation_date: string | null
  webhook_payload: Record<string, unknown> | null
  flights: {
    id: number
    name: string
    airline_code: string
    start_date: string
    end_date: string
    supplier_id: number
  } | null
}

interface Stats {
  total: number
  confirmed: number
  modified: number
  cancelled: number
  totalPassengers: number
  totalRevenue: number
}

const statusStyles = {
  confirmed: 'bg-green-100 text-green-800',
  modified: 'bg-blue-100 text-blue-800',
  cancelled: 'bg-red-100 text-red-800',
}

const statusLabels = {
  confirmed: 'Confirmada',
  modified: 'Modificada',
  cancelled: 'Cancelada',
}

// Supplier ID to name mapping
const supplierNames: Record<number, string> = {
  19657: 'TopDest',
  18259: 'Sí Viajo',
}

function getSupplierName(supplierId: number | undefined): string {
  if (!supplierId) return '-'
  return supplierNames[supplierId] || `Supplier ${supplierId}`
}

export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null)
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [reservationToCancel, setReservationToCancel] = useState<Reservation | null>(null)

  // Filters
  const [status, setStatus] = useState('all')
  const [search, setSearch] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')

  const pageSize = 50

  const fetchReservations = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      })

      if (status !== 'all') params.set('status', status)
      if (search) params.set('search', search)
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const response = await fetch(`/api/reservations?${params}`)
      const data = await response.json()

      if (response.ok) {
        setReservations(data.reservations || [])
        setTotal(data.total || 0)
      } else {
        toast.error('Error al cargar reservas')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [status, search, startDate, endDate, page])

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (startDate) params.set('start_date', startDate)
      if (endDate) params.set('end_date', endDate)

      const response = await fetch(`/api/reservations/stats?${params}`)
      const data = await response.json()

      if (response.ok) {
        setStats(data)
      }
    } catch {
      // Ignore stats errors
    }
  }, [startDate, endDate])

  useEffect(() => {
    fetchReservations()
    fetchStats()
  }, [fetchReservations, fetchStats])

  const handleSearch = () => {
    setPage(0)
    fetchReservations()
  }

  const handleCancelReservation = async () => {
    if (!reservationToCancel) return

    try {
      const response = await fetch(`/api/reservations/${reservationToCancel.id}`, {
        method: 'DELETE',
      })

      if (response.ok) {
        toast.success('Reserva cancelada')
        fetchReservations()
        fetchStats()
      } else {
        const data = await response.json()
        toast.error(data.error || 'Error al cancelar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCancelDialogOpen(false)
      setReservationToCancel(null)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
    })
  }

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Reservas</h1>
          <p className="text-muted-foreground">
            Ventas recibidas desde TravelCompositor
          </p>
        </div>
        <Button variant="outline" onClick={() => { fetchReservations(); fetchStats() }} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Reservas</CardTitle>
              <Ticket className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
              <p className="text-xs text-muted-foreground">
                {stats.confirmed} confirmadas, {stats.cancelled} canceladas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pasajeros</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalPassengers}</div>
              <p className="text-xs text-muted-foreground">
                En reservas activas
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ingresos</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                ${stats.totalRevenue.toLocaleString('es-AR')}
              </div>
              <p className="text-xs text-muted-foreground">
                Total facturado
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Tasa Cancelación</CardTitle>
              <XCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {stats.total > 0 ? ((stats.cancelled / stats.total) * 100).toFixed(1) : 0}%
              </div>
              <p className="text-xs text-muted-foreground">
                {stats.cancelled} de {stats.total}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="flex gap-2">
                <Input
                  placeholder="Buscar por referencia..."
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
                <SelectItem value="confirmed">Confirmadas</SelectItem>
                <SelectItem value="modified">Modificadas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
              </SelectContent>
            </Select>

            <div className="flex items-center gap-2">
              <DatePicker
                value={startDate}
                onChange={(date) => { setStartDate(date); setPage(0) }}
                placeholder="Desde"
                className="w-[160px]"
              />
              <span className="text-muted-foreground">-</span>
              <DatePicker
                value={endDate}
                onChange={(date) => { setEndDate(date); setPage(0) }}
                placeholder="Hasta"
                className="w-[160px]"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reservations Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">
            {total} reserva(s) encontrada(s)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N° Reserva</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Vuelo</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-center">Pasajeros</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Fecha Viaje</TableHead>
                <TableHead>Fecha Reserva</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : reservations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    No hay reservas para mostrar
                  </TableCell>
                </TableRow>
              ) : (
                reservations.map((reservation) => (
                  <TableRow
                    key={reservation.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedReservation(reservation)}
                  >
                    <TableCell className="font-mono text-sm font-medium">
                      {(() => {
                        // Extract main bookingReference from webhook_payload root
                        const payload = reservation.webhook_payload as Record<string, unknown> | null
                        const mainRef = payload?.bookingReference as string
                        // If main ref exists and is different from transport ref, use it
                        if (mainRef && !mainRef.includes('TRANSPORT')) {
                          return mainRef
                        }
                        // Fallback: use booking_reference if it looks like main ref
                        if (!reservation.booking_reference.includes('TRANSPORT')) {
                          return reservation.booking_reference
                        }
                        return mainRef || reservation.booking_reference
                      })()}
                    </TableCell>
                    <TableCell className="text-sm">
                      {getSupplierName(reservation.flights?.supplier_id)}
                    </TableCell>
                    <TableCell>
                      {reservation.flights ? (
                        <span className="text-sm">
                          {reservation.flights.name}
                          <span className="text-muted-foreground block text-xs">
                            {reservation.flights.airline_code}
                          </span>
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={statusStyles[reservation.status]}>
                        {statusLabels[reservation.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className="font-medium">
                        {reservation.total_passengers || (reservation.adults + reservation.children + reservation.infants)}
                      </span>
                      <span className="text-muted-foreground text-xs block">
                        {reservation.adults || 0}A {reservation.children || 0}N {reservation.infants || 0}B
                      </span>
                    </TableCell>
                    <TableCell>
                      {reservation.total_amount ? (
                        <span className="font-medium">
                          ${Number(reservation.total_amount).toLocaleString('es-AR')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDate(reservation.travel_date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {formatDateTime(reservation.reservation_date)}
                    </TableCell>
                    <TableCell>
                      {reservation.status !== 'cancelled' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation()
                            setReservationToCancel(reservation)
                            setCancelDialogOpen(true)
                          }}
                        >
                          <XCircle className="h-4 w-4 text-red-500" />
                        </Button>
                      )}
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

      {/* Reservation Detail Dialog */}
      <Dialog open={!!selectedReservation} onOpenChange={() => setSelectedReservation(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Reserva: {selectedReservation?.booking_reference}
            </DialogTitle>
          </DialogHeader>

          {selectedReservation && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Estado</h4>
                  <Badge variant="outline" className={statusStyles[selectedReservation.status]}>
                    {statusLabels[selectedReservation.status]}
                  </Badge>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">TC Service ID</h4>
                  <p className="text-sm font-mono">{selectedReservation.tc_service_id}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Proveedor</h4>
                  <p className="text-sm">{getSupplierName(selectedReservation.flights?.supplier_id)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Vuelo</h4>
                  <p className="text-sm">
                    {selectedReservation.flights?.name || 'No vinculado'}
                  </p>
                </div>
              </div>

              <div className="border-t pt-4">
                <h4 className="text-sm font-medium mb-2">Pasajeros</h4>
                <div className="grid grid-cols-4 gap-4 text-center">
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-2xl font-bold">{selectedReservation.adults}</p>
                    <p className="text-xs text-muted-foreground">Adultos</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-2xl font-bold">{selectedReservation.children}</p>
                    <p className="text-xs text-muted-foreground">Niños</p>
                  </div>
                  <div className="bg-muted p-3 rounded-lg">
                    <p className="text-2xl font-bold">{selectedReservation.infants}</p>
                    <p className="text-xs text-muted-foreground">Bebés</p>
                  </div>
                  <div className="bg-primary/10 p-3 rounded-lg">
                    <p className="text-2xl font-bold">
                      {selectedReservation.total_passengers || (selectedReservation.adults + selectedReservation.children + selectedReservation.infants)}
                    </p>
                    <p className="text-xs text-muted-foreground">Total</p>
                  </div>
                </div>
              </div>

              <div className="border-t pt-4 grid grid-cols-2 gap-4">
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Monto Total</h4>
                  <p className="text-lg font-bold">
                    {selectedReservation.total_amount
                      ? `$${Number(selectedReservation.total_amount).toLocaleString('es-AR')} ${selectedReservation.currency}`
                      : '-'}
                  </p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha de Viaje</h4>
                  <p className="text-sm">{formatDate(selectedReservation.travel_date)}</p>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Fecha de Reserva</h4>
                  <p className="text-sm">{formatDateTime(selectedReservation.reservation_date)}</p>
                </div>
                {selectedReservation.modification_date && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Última Modificación</h4>
                    <p className="text-sm">{formatDateTime(selectedReservation.modification_date)}</p>
                  </div>
                )}
                {selectedReservation.cancellation_date && (
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground">Fecha Cancelación</h4>
                    <p className="text-sm text-red-600">{formatDateTime(selectedReservation.cancellation_date)}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar reserva?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción cancelará la reserva <strong>{reservationToCancel?.booking_reference}</strong>.
              Los asientos serán devueltos al inventario.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, mantener</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCancelReservation}
              className="bg-red-600 hover:bg-red-700"
            >
              Sí, cancelar reserva
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
