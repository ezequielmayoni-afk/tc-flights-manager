'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Pencil, Copy, Plus, Filter, X, ArrowUp, ArrowDown, ArrowUpDown, RefreshCw, Loader2, Trash2, Backpack, Briefcase, Luggage } from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
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
import { toast } from 'sonner'
import Link from 'next/link'
import { CopyFlightDialog } from './CopyFlightDialog'

// Format date string (YYYY-MM-DD) to local display without timezone issues
function formatDate(dateStr: string): string {
  if (!dateStr) return '-'
  // Parse the date parts directly to avoid timezone conversion
  const [year, month, day] = dateStr.split('-').map(Number)
  return `${day}/${month}/${year}`
}

// Format datetime (ISO string) to local display - consistent for SSR
function formatDateTime(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear()
  return `${day}/${month}/${year}`
}

// Parse date string as local date (not UTC)
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

// Normalize string by removing accents/diacritics
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

const syncStatusStyles = {
  pending: 'bg-yellow-100 text-yellow-800',
  synced: 'bg-green-100 text-green-800',
  error: 'bg-red-100 text-red-800',
  modified: 'bg-blue-100 text-blue-800',
}

const syncStatusLabels = {
  pending: 'Pendiente',
  synced: 'Sincronizado',
  error: 'Error',
  modified: 'Modificado',
}

const legTypeLabels = {
  outbound: 'Ida',
  return: 'Vuelta',
}

const legTypeStyles = {
  outbound: 'bg-blue-100 text-blue-800',
  return: 'bg-purple-100 text-purple-800',
}

type FlightWithSegments = {
  id: number
  base_id: string
  name: string
  airline_code: string
  start_date: string
  end_date: string
  sync_status: string
  base_adult_rt_price: number
  base_children_rt_price: number
  base_infant_rt_price: number
  release_contract: number
  created_at: string
  last_sync_at: string | null
  leg_type?: 'outbound' | 'return' | null
  paired_flight_id?: number | null
  tc_transport_id?: string | null
  supplier_id: number
  suppliers: { name: string } | null
  flight_segments: {
    departure_location_code: string
    arrival_location_code: string
    sort_order: number
    plus_days: number
  }[]
  modalities?: {
    baggage_allowance?: string | null
    includes_backpack?: boolean
    carryon_weight?: number
    checked_bag_weight?: number
    checked_bags_quantity?: number
    modality_inventories?: {
      quantity: number
      sold: number
      remaining_seats: number
    }[]
  }[]
}

interface FlightsTableProps {
  flights: FlightWithSegments[]
}

// Calculate expiration date based on start_date and release_contract
function getExpirationInfo(startDate: string, releaseDays: number): { date: Date; dateStr: string; daysUntil: number; status: 'ok' | 'warning' | 'danger' } {
  const start = parseLocalDate(startDate)
  const expiration = new Date(start)
  expiration.setDate(expiration.getDate() - releaseDays)

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  expiration.setHours(0, 0, 0, 0)

  const daysUntil = Math.ceil((expiration.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  let status: 'ok' | 'warning' | 'danger' = 'ok'
  if (daysUntil < 45) {
    status = 'danger'
  } else if (daysUntil < 60) {
    status = 'warning'
  }

  // Format expiration date for display
  const dateStr = `${expiration.getDate()}/${expiration.getMonth() + 1}/${expiration.getFullYear()}`

  return { date: expiration, dateStr, daysUntil, status }
}

// Calculate hotel nights based on arrival at destination to departure of return
// outboundStartDate: departure date of outbound flight
// returnStartDate: departure date of return flight
// outboundSegments: segments of the outbound flight (to get plus_days for arrival)
function getHotelNights(
  outboundStartDate: string,
  returnStartDate: string,
  outboundSegments: FlightWithSegments['flight_segments']
): number {
  const outboundStart = parseLocalDate(outboundStartDate)
  const returnStart = parseLocalDate(returnStartDate)

  // Get max plus_days from outbound segments (arrival at destination)
  let outboundPlusDays = 0
  if (outboundSegments && outboundSegments.length > 0) {
    outboundPlusDays = Math.max(0, ...outboundSegments.map(s => s.plus_days || 0))
  }

  // Arrival date at destination = outbound start_date + max plus_days
  const arrivalAtDestination = new Date(outboundStart)
  arrivalAtDestination.setDate(arrivalAtDestination.getDate() + outboundPlusDays)

  // Hotel nights = return departure date - arrival at destination
  const nights = Math.round((returnStart.getTime() - arrivalAtDestination.getTime()) / (1000 * 60 * 60 * 24))
  return nights
}

// Format route as "EZE - MAD / MAD - EZE"
function formatRoute(segments: FlightWithSegments['flight_segments']): string {
  if (!segments || segments.length === 0) return '-'

  const sorted = [...segments].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
  const midpoint = Math.ceil(sorted.length / 2)
  const outbound = sorted.slice(0, midpoint)
  const returnFlight = sorted.slice(midpoint)

  const outboundRoute = outbound.length > 0
    ? `${outbound[0].departure_location_code} - ${outbound[outbound.length - 1].arrival_location_code}`
    : ''

  const returnRoute = returnFlight.length > 0
    ? `${returnFlight[0].departure_location_code} - ${returnFlight[returnFlight.length - 1].arrival_location_code}`
    : ''

  if (outboundRoute && returnRoute) {
    return `${outboundRoute} / ${returnRoute}`
  }
  return outboundRoute || returnRoute || '-'
}

type SortDirection = 'asc' | 'desc' | null
type SortColumn = 'supplier' | 'base_id' | 'created_at' | 'name' | 'route' | 'airline_code' | 'dates' | 'nights' | 'quantity' | 'sold' | 'remaining' | 'expiration' | 'sync_status' | 'last_sync_at'

// Filter and sortable column header component
function FilterHeader({
  label,
  value,
  onChange,
  placeholder = "Filtrar...",
  sortable = false,
  sortDirection,
  onSort,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: () => void
}) {
  const hasFilter = value.length > 0

  return (
    <div className="flex items-center gap-1">
      {sortable ? (
        <button
          onClick={onSort}
          className="flex items-center gap-1 hover:text-primary transition-colors"
        >
          <span>{label}</span>
          {sortDirection === 'asc' ? (
            <ArrowUp className="h-3 w-3 text-primary" />
          ) : sortDirection === 'desc' ? (
            <ArrowDown className="h-3 w-3 text-primary" />
          ) : (
            <ArrowUpDown className="h-3 w-3 text-muted-foreground" />
          )}
        </button>
      ) : (
        <span>{label}</span>
      )}
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className={`h-6 w-6 p-0 ${hasFilter ? 'text-primary' : 'text-muted-foreground'}`}
          >
            <Filter className="h-3 w-3" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-52 p-2" align="start">
          <div className="flex items-center gap-1">
            <Input
              placeholder={placeholder}
              value={value}
              onChange={(e) => onChange(e.target.value)}
              className="h-8 text-sm"
              autoFocus
            />
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onChange('')}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function FlightsTable({ flights }: FlightsTableProps) {
  const router = useRouter()
  const [copyDialogOpen, setCopyDialogOpen] = useState(false)
  const [selectedFlight, setSelectedFlight] = useState<FlightWithSegments | null>(null)
  const [syncingFlightId, setSyncingFlightId] = useState<number | null>(null)

  // Selection state for bulk operations
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())

  // Delete dialog state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [flightToDelete, setFlightToDelete] = useState<FlightWithSegments | null>(null)
  const [deletingFlightId, setDeletingFlightId] = useState<number | null>(null)

  // Bulk operation state
  const [bulkSyncing, setBulkSyncing] = useState(false)
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false)

  const handleSyncClick = async (flightId: number): Promise<boolean> => {
    setSyncingFlightId(flightId)
    try {
      const response = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightId }),
      })

      const data = await response.json()

      if (response.ok && data.success) {
        toast.success('Sincronizado', {
          description: `TC ID: ${data.transportId}`,
        })
        return true
      } else {
        toast.error('Error de sincronización', {
          description: data.error || 'No se pudo sincronizar el vuelo',
        })
        return false
      }
    } catch (error) {
      toast.error('Error', {
        description: 'Error de conexión al sincronizar',
      })
      return false
    } finally {
      setSyncingFlightId(null)
    }
  }

  const handleDeleteClick = (flight: FlightWithSegments) => {
    setFlightToDelete(flight)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async (deleteFromTC: boolean) => {
    if (!flightToDelete) return

    setDeletingFlightId(flightToDelete.id)
    setDeleteDialogOpen(false)

    const pairedFlight = getPairedFlight(flightToDelete)
    const flightsToDelete = pairedFlight ? [flightToDelete.id, pairedFlight.id] : [flightToDelete.id]

    let tcDeletedCount = 0
    let tcErrorCount = 0

    try {
      for (const id of flightsToDelete) {
        const url = deleteFromTC
          ? `/api/flights/${id}?deleteFromTC=true`
          : `/api/flights/${id}`

        const response = await fetch(url, {
          method: 'DELETE',
        })

        if (!response.ok) {
          const error = await response.json()
          throw new Error(error.error || 'Error al eliminar')
        }

        const result = await response.json()
        if (result.tcDeleted) tcDeletedCount++
        if (result.tcError) tcErrorCount++
      }

      let description = pairedFlight ? 'Vuelos Ida y Vuelta eliminados' : 'Vuelo eliminado'
      if (deleteFromTC) {
        if (tcDeletedCount > 0) {
          description += ` (${tcDeletedCount} desactivado(s) en TC)`
        }
        if (tcErrorCount > 0) {
          description += ` - ${tcErrorCount} error(es) en TC`
        }
      }

      toast.success('Eliminado', { description })
      router.refresh()
    } catch (error) {
      toast.error('Error', {
        description: error instanceof Error ? error.message : 'Error al eliminar',
      })
    } finally {
      setDeletingFlightId(null)
      setFlightToDelete(null)
    }
  }

  // Bulk sync selected flights
  const handleBulkSync = async () => {
    if (selectedIds.size === 0) return

    setBulkSyncing(true)
    let successCount = 0
    let errorCount = 0

    // Get all flight IDs to sync (including paired flights)
    const allFlightIds: number[] = []
    selectedIds.forEach(id => {
      const flight = flights.find(f => f.id === id)
      if (flight) {
        const paired = getPairedFlight(flight)
        if (paired) {
          // Add return first, then outbound for correct linking
          const outbound = flight.leg_type === 'outbound' ? flight : paired
          const returnFlt = flight.leg_type === 'return' ? flight : paired
          if (!allFlightIds.includes(returnFlt.id)) allFlightIds.push(returnFlt.id)
          if (!allFlightIds.includes(outbound.id)) allFlightIds.push(outbound.id)
        } else {
          if (!allFlightIds.includes(id)) allFlightIds.push(id)
        }
      }
    })

    // Sync sequentially
    for (const flightId of allFlightIds) {
      const success = await handleSyncClick(flightId)
      if (success) successCount++
      else errorCount++
    }

    setBulkSyncing(false)
    setSelectedIds(new Set())
    router.refresh()

    if (errorCount === 0) {
      toast.success('Sincronización completada', {
        description: `${successCount} vuelo(s) sincronizado(s)`,
      })
    } else {
      toast.warning('Sincronización parcial', {
        description: `${successCount} exitosos, ${errorCount} errores`,
      })
    }
  }

  // Bulk delete selected flights
  const handleBulkDelete = async (deleteFromTC: boolean) => {
    if (selectedIds.size === 0) return

    setBulkDeleting(true)
    setBulkDeleteDialogOpen(false)

    // Get all flight IDs to delete (including paired flights)
    const allFlightIds: number[] = []
    selectedIds.forEach(id => {
      const flight = flights.find(f => f.id === id)
      if (flight) {
        const paired = getPairedFlight(flight)
        if (paired) {
          if (!allFlightIds.includes(flight.id)) allFlightIds.push(flight.id)
          if (!allFlightIds.includes(paired.id)) allFlightIds.push(paired.id)
        } else {
          if (!allFlightIds.includes(id)) allFlightIds.push(id)
        }
      }
    })

    let successCount = 0
    let errorCount = 0
    let tcDeletedCount = 0
    let tcErrorCount = 0

    for (const flightId of allFlightIds) {
      try {
        const url = deleteFromTC
          ? `/api/flights/${flightId}?deleteFromTC=true`
          : `/api/flights/${flightId}`

        const response = await fetch(url, {
          method: 'DELETE',
        })

        if (response.ok) {
          successCount++
          const result = await response.json()
          if (result.tcDeleted) tcDeletedCount++
          if (result.tcError) tcErrorCount++
        } else {
          errorCount++
        }
      } catch {
        errorCount++
      }
    }

    setBulkDeleting(false)
    setSelectedIds(new Set())
    router.refresh()

    let description = `${successCount} vuelo(s) eliminado(s)`
    if (deleteFromTC) {
      if (tcDeletedCount > 0) {
        description += ` (${tcDeletedCount} desactivado(s) en TC)`
      }
      if (tcErrorCount > 0) {
        description += ` - ${tcErrorCount} error(es) en TC`
      }
    }
    if (errorCount > 0) {
      description += ` - ${errorCount} error(es)`
    }

    if (errorCount === 0) {
      toast.success('Eliminación completada', { description })
    } else {
      toast.warning('Eliminación parcial', { description })
    }
  }

  // Toggle single selection
  const toggleSelection = (flightId: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(flightId)) {
        newSet.delete(flightId)
      } else {
        newSet.add(flightId)
      }
      return newSet
    })
  }

  // Toggle all selection
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredFlights.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredFlights.map(f => f.id)))
    }
  }

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn | null>(null)
  const [sortDirection, setSortDirection] = useState<SortDirection>(null)

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      // Toggle direction: null -> asc -> desc -> null
      if (sortDirection === null) {
        setSortDirection('asc')
      } else if (sortDirection === 'asc') {
        setSortDirection('desc')
      } else {
        setSortDirection(null)
        setSortColumn(null)
      }
    } else {
      setSortColumn(column)
      setSortDirection('asc')
    }
  }

  const getSortDirection = (column: SortColumn): SortDirection => {
    return sortColumn === column ? sortDirection : null
  }

  // Filters state
  const [filters, setFilters] = useState({
    supplier: '',
    base_id: '',
    created_at: '',
    name: '',
    route: '',
    airline_code: '',
    dates: '',
    nights: '',
    quantity: '',
    sold: '',
    remaining: '',
    expiration: '',
    sync_status: '',
    last_sync_at: '',
  })

  const activeFiltersCount = Object.values(filters).filter(v => v.length > 0).length

  const handleCopyClick = (flight: FlightWithSegments) => {
    setSelectedFlight(flight)
    setCopyDialogOpen(true)
  }

  const handleCopySuccess = () => {
    router.refresh()
  }

  const updateFilter = (key: keyof typeof filters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }))
  }

  const clearAllFilters = () => {
    setFilters({
      supplier: '',
      base_id: '',
      created_at: '',
      name: '',
      route: '',
      airline_code: '',
      dates: '',
      nights: '',
      quantity: '',
      sold: '',
      remaining: '',
      expiration: '',
      sync_status: '',
      last_sync_at: '',
    })
  }

  // Group paired flights - show only one flight per pair
  const groupedFlights = useMemo(() => {
    // Create a set of flight IDs that should be hidden (the "other" flight in each pair)
    const hiddenFlightIds = new Set<number>()

    flights.forEach(flight => {
      if (flight.paired_flight_id && !hiddenFlightIds.has(flight.id)) {
        // This flight has a pair - decide which one to show
        // Show the outbound one, or if no leg_type, show the one with lower ID
        if (flight.leg_type === 'return') {
          hiddenFlightIds.add(flight.id)
        } else if (flight.leg_type === 'outbound') {
          hiddenFlightIds.add(flight.paired_flight_id)
        } else {
          // No leg_type set - show the one with lower ID
          if (flight.id > flight.paired_flight_id) {
            hiddenFlightIds.add(flight.id)
          } else {
            hiddenFlightIds.add(flight.paired_flight_id)
          }
        }
      }
    })

    return flights.filter(flight => !hiddenFlightIds.has(flight.id))
  }, [flights])

  // Get paired flight for a given flight
  const getPairedFlight = (flight: FlightWithSegments): FlightWithSegments | null => {
    if (!flight.paired_flight_id) return null
    return flights.find(f => f.id === flight.paired_flight_id) || null
  }

  // Helper to get flight dates (outbound and return)
  const getFlightDates = (flight: FlightWithSegments) => {
    const paired = getPairedFlight(flight)
    const outbound = flight.leg_type === 'outbound' ? flight : paired
    const returnFlt = flight.leg_type === 'return' ? flight : paired
    const outboundDate = outbound?.start_date || flight.start_date
    const returnDate = returnFlt?.start_date || flight.end_date
    const outboundSegments = outbound?.flight_segments || flight.flight_segments
    return { outboundDate, returnDate, outboundSegments }
  }

  // Filter and sort flights
  const filteredFlights = useMemo(() => {
    // First filter
    const filtered = groupedFlights.filter(flight => {
      const { outboundDate, returnDate, outboundSegments } = getFlightDates(flight)
      const paired = getPairedFlight(flight)
      const allSegments = paired
        ? [...(flight.leg_type === 'outbound' ? flight : paired).flight_segments, ...(flight.leg_type === 'return' ? flight : paired).flight_segments]
        : flight.flight_segments
      const route = formatRoute(allSegments)
      const dates = `${formatDate(outboundDate)} - ${formatDate(returnDate)}`
      const nights = getHotelNights(outboundDate, returnDate, outboundSegments)
      const inventory = flight.modalities?.[0]?.modality_inventories?.[0]
      const quantity = inventory?.quantity ?? 0
      const sold = inventory?.sold ?? 0
      const remaining = inventory?.remaining_seats ?? quantity
      const expInfo = getExpirationInfo(outboundDate, flight.release_contract || 0)

      const supplierName = normalizeText(flight.suppliers?.name || '')

      return (
        supplierName.includes(normalizeText(filters.supplier)) &&
        normalizeText(flight.base_id).includes(normalizeText(filters.base_id)) &&
        formatDateTime(flight.created_at).includes(filters.created_at) &&
        normalizeText(flight.name).includes(normalizeText(filters.name)) &&
        normalizeText(route).includes(normalizeText(filters.route)) &&
        normalizeText(flight.airline_code).includes(normalizeText(filters.airline_code)) &&
        normalizeText(dates).includes(normalizeText(filters.dates)) &&
        nights.toString().includes(filters.nights) &&
        quantity.toString().includes(filters.quantity) &&
        sold.toString().includes(filters.sold) &&
        remaining.toString().includes(filters.remaining) &&
        expInfo.dateStr.includes(filters.expiration) &&
        normalizeText(syncStatusLabels[flight.sync_status as keyof typeof syncStatusLabels] || flight.sync_status)
          .includes(normalizeText(filters.sync_status)) &&
        (flight.last_sync_at
          ? formatDateTime(flight.last_sync_at).includes(filters.last_sync_at)
          : filters.last_sync_at === '' || 'nunca'.includes(normalizeText(filters.last_sync_at))
        )
      )
    })

    // Then sort if a column is selected
    if (!sortColumn || !sortDirection) {
      return filtered
    }

    return [...filtered].sort((a, b) => {
      let aValue: string | number | Date
      let bValue: string | number | Date

      const aDates = getFlightDates(a)
      const bDates = getFlightDates(b)

      switch (sortColumn) {
        case 'supplier':
          aValue = a.suppliers?.name || ''
          bValue = b.suppliers?.name || ''
          break
        case 'base_id':
          aValue = a.base_id
          bValue = b.base_id
          break
        case 'created_at':
          aValue = new Date(a.created_at)
          bValue = new Date(b.created_at)
          break
        case 'name':
          aValue = a.name.toLowerCase()
          bValue = b.name.toLowerCase()
          break
        case 'route':
          aValue = formatRoute(a.flight_segments)
          bValue = formatRoute(b.flight_segments)
          break
        case 'airline_code':
          aValue = a.airline_code
          bValue = b.airline_code
          break
        case 'dates':
          aValue = new Date(aDates.outboundDate)
          bValue = new Date(bDates.outboundDate)
          break
        case 'nights':
          aValue = getHotelNights(aDates.outboundDate, aDates.returnDate, aDates.outboundSegments)
          bValue = getHotelNights(bDates.outboundDate, bDates.returnDate, bDates.outboundSegments)
          break
        case 'quantity':
          aValue = a.modalities?.[0]?.modality_inventories?.[0]?.quantity ?? 0
          bValue = b.modalities?.[0]?.modality_inventories?.[0]?.quantity ?? 0
          break
        case 'sold':
          aValue = a.modalities?.[0]?.modality_inventories?.[0]?.sold ?? 0
          bValue = b.modalities?.[0]?.modality_inventories?.[0]?.sold ?? 0
          break
        case 'remaining':
          aValue = a.modalities?.[0]?.modality_inventories?.[0]?.remaining_seats ?? (a.modalities?.[0]?.modality_inventories?.[0]?.quantity ?? 0)
          bValue = b.modalities?.[0]?.modality_inventories?.[0]?.remaining_seats ?? (b.modalities?.[0]?.modality_inventories?.[0]?.quantity ?? 0)
          break
        case 'expiration':
          aValue = getExpirationInfo(aDates.outboundDate, a.release_contract || 0).daysUntil
          bValue = getExpirationInfo(bDates.outboundDate, b.release_contract || 0).daysUntil
          break
        case 'sync_status':
          aValue = a.sync_status
          bValue = b.sync_status
          break
        case 'last_sync_at':
          aValue = a.last_sync_at ? new Date(a.last_sync_at).getTime() : 0
          bValue = b.last_sync_at ? new Date(b.last_sync_at).getTime() : 0
          break
        default:
          return 0
      }

      // Compare values
      if (aValue instanceof Date && bValue instanceof Date) {
        const comparison = aValue.getTime() - bValue.getTime()
        return sortDirection === 'asc' ? comparison : -comparison
      }

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue
      }

      // String comparison
      const aStr = String(aValue)
      const bStr = String(bValue)
      const comparison = aStr.localeCompare(bStr)
      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [groupedFlights, filters, sortColumn, sortDirection, flights])

  return (
    <>
      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="px-4 py-2 bg-blue-50 border-b flex items-center justify-between">
          <span className="text-sm font-medium text-blue-800">
            {selectedIds.size} vuelo(s) seleccionado(s)
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleBulkSync}
              disabled={bulkSyncing || bulkDeleting}
            >
              {bulkSyncing ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-1" />
              )}
              Sincronizar seleccionados
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setBulkDeleteDialogOpen(true)}
              disabled={bulkSyncing || bulkDeleting}
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {bulkDeleting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              Eliminar seleccionados
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {activeFiltersCount > 0 && selectedIds.size === 0 && (
        <div className="px-4 py-2 bg-muted/50 border-b flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {filteredFlights.length} de {flights.length} vuelos
          </span>
          <Button variant="ghost" size="sm" onClick={clearAllFilters}>
            <X className="h-3 w-3 mr-1" />
            Limpiar filtros
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={selectedIds.size === filteredFlights.length && filteredFlights.length > 0}
                  onCheckedChange={toggleSelectAll}
                />
              </TableHead>
              <TableHead>
                <FilterHeader label="Creado" value={filters.created_at} onChange={(v) => updateFilter('created_at', v)} sortable sortDirection={getSortDirection('created_at')} onSort={() => handleSort('created_at')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Proveedor" value={filters.supplier} onChange={(v) => updateFilter('supplier', v)} sortable sortDirection={getSortDirection('supplier')} onSort={() => handleSort('supplier')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="ID" value={filters.base_id} onChange={(v) => updateFilter('base_id', v)} sortable sortDirection={getSortDirection('base_id')} onSort={() => handleSort('base_id')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Nombre" value={filters.name} onChange={(v) => updateFilter('name', v)} sortable sortDirection={getSortDirection('name')} onSort={() => handleSort('name')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Ruta" value={filters.route} onChange={(v) => updateFilter('route', v)} sortable sortDirection={getSortDirection('route')} onSort={() => handleSort('route')} />
              </TableHead>
              <TableHead>
                <span>Tramo</span>
              </TableHead>
              <TableHead>
                <FilterHeader label="Aerolínea" value={filters.airline_code} onChange={(v) => updateFilter('airline_code', v)} sortable sortDirection={getSortDirection('airline_code')} onSort={() => handleSort('airline_code')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Fechas" value={filters.dates} onChange={(v) => updateFilter('dates', v)} sortable sortDirection={getSortDirection('dates')} onSort={() => handleSort('dates')} />
              </TableHead>
              <TableHead className="text-center">
                <span>Equipaje</span>
              </TableHead>
              <TableHead className="text-center">
                <FilterHeader label="Noches" value={filters.nights} onChange={(v) => updateFilter('nights', v)} sortable sortDirection={getSortDirection('nights')} onSort={() => handleSort('nights')} />
              </TableHead>
              <TableHead className="text-center">
                <FilterHeader label="Lugares" value={filters.quantity} onChange={(v) => updateFilter('quantity', v)} sortable sortDirection={getSortDirection('quantity')} onSort={() => handleSort('quantity')} />
              </TableHead>
              <TableHead className="text-center">
                <FilterHeader label="Vendidos" value={filters.sold} onChange={(v) => updateFilter('sold', v)} sortable sortDirection={getSortDirection('sold')} onSort={() => handleSort('sold')} />
              </TableHead>
              <TableHead className="text-center">
                <FilterHeader label="Restantes" value={filters.remaining} onChange={(v) => updateFilter('remaining', v)} sortable sortDirection={getSortDirection('remaining')} onSort={() => handleSort('remaining')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Vencimiento" value={filters.expiration} onChange={(v) => updateFilter('expiration', v)} sortable sortDirection={getSortDirection('expiration')} onSort={() => handleSort('expiration')} />
              </TableHead>
              <TableHead>
                <FilterHeader label="Estado" value={filters.sync_status} onChange={(v) => updateFilter('sync_status', v)} sortable sortDirection={getSortDirection('sync_status')} onSort={() => handleSort('sync_status')} />
              </TableHead>
              <TableHead>
                <span>TC ID</span>
              </TableHead>
              <TableHead>
                <FilterHeader label="Últ. Sync" value={filters.last_sync_at} onChange={(v) => updateFilter('last_sync_at', v)} sortable sortDirection={getSortDirection('last_sync_at')} onSort={() => handleSort('last_sync_at')} />
              </TableHead>
              <TableHead className="w-[120px]">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredFlights.length === 0 ? (
              <TableRow>
                <TableCell colSpan={19} className="text-center py-8">
                  <p className="text-muted-foreground">
                    {flights.length === 0 ? 'No hay vuelos cargados' : 'No hay vuelos que coincidan con los filtros'}
                  </p>
                  {flights.length === 0 && (
                    <Button asChild className="mt-4">
                      <Link href="/flights/new">
                        <Plus className="h-4 w-4 mr-2" />
                        Crear primer vuelo
                      </Link>
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              filteredFlights.map((flight) => {
                const pairedFlight = getPairedFlight(flight)

                // Determine outbound and return flights
                const outboundFlight = flight.leg_type === 'outbound' ? flight : pairedFlight
                const returnFlight = flight.leg_type === 'return' ? flight : pairedFlight

                // Get dates from outbound and return flights
                const outboundDate = outboundFlight?.start_date || flight.start_date
                const returnDate = returnFlight?.start_date || flight.end_date

                // Combine segments from both flights for route display
                const allSegments = pairedFlight
                  ? [...(outboundFlight?.flight_segments || []), ...(returnFlight?.flight_segments || [])]
                  : flight.flight_segments
                const route = formatRoute(allSegments)

                // Calculate nights using outbound arrival and return departure
                const outboundSegments = outboundFlight?.flight_segments || flight.flight_segments
                const nights = getHotelNights(outboundDate, returnDate, outboundSegments)

                const inventory = flight.modalities?.[0]?.modality_inventories?.[0]
                const quantity = inventory?.quantity ?? 0
                const sold = inventory?.sold ?? 0
                const remaining = inventory?.remaining_seats ?? quantity
                const expInfo = getExpirationInfo(outboundDate, flight.release_contract || 0)

                // For paired flights, show base_id without the -IDA/-VUELTA suffix
                const displayBaseId = pairedFlight
                  ? flight.base_id.replace(/-IDA$|-VUELTA$/, '')
                  : flight.base_id

                // For paired flights, show name without (Ida)/(Vuelta) suffix
                const displayName = pairedFlight
                  ? flight.name.replace(/ \(Ida\)$| \(Vuelta\)$/, '')
                  : flight.name

                // Get baggage info from modality
                const modality = flight.modalities?.[0]
                const hasBackpack = modality?.includes_backpack ?? false
                const hasCarryOn = (modality?.carryon_weight ?? 0) > 0
                const hasCheckedBag = (modality?.checked_bag_weight ?? 0) > 0
                const carryOnWeight = modality?.carryon_weight ?? 0
                const checkedBagWeight = modality?.checked_bag_weight ?? 0
                const checkedBagsQty = modality?.checked_bags_quantity ?? 1

                return (
                  <TableRow key={flight.id} className={selectedIds.has(flight.id) ? 'bg-blue-50' : ''}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(flight.id)}
                        onCheckedChange={() => toggleSelection(flight.id)}
                      />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatDateTime(flight.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {flight.suppliers?.name || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {displayBaseId}
                    </TableCell>
                    <TableCell className="font-medium">{displayName}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">{route}</TableCell>
                    <TableCell>
                      {pairedFlight ? (
                        <div className="flex gap-1">
                          <Badge variant="secondary" className={legTypeStyles.outbound}>
                            {legTypeLabels.outbound}
                          </Badge>
                          <Badge variant="secondary" className={legTypeStyles.return}>
                            {legTypeLabels.return}
                          </Badge>
                        </div>
                      ) : flight.leg_type ? (
                        <Badge
                          variant="secondary"
                          className={legTypeStyles[flight.leg_type]}
                        >
                          {legTypeLabels[flight.leg_type]}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>{flight.airline_code}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {formatDate(outboundDate)} - {formatDate(returnDate)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-0.5">
                        {/* Mochila */}
                        {hasBackpack ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="p-0.5 hover:bg-gray-100 rounded" title="Mochila incluida">
                                <Backpack className="h-4 w-4 text-teal-600" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="center">
                              <span className="text-sm font-medium">Mochila incluida</span>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="p-0.5">
                            <Backpack className="h-4 w-4 text-gray-300" />
                          </span>
                        )}
                        {/* Carry-on */}
                        {hasCarryOn ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="p-0.5 hover:bg-gray-100 rounded" title="Carry-on incluido">
                                <Briefcase className="h-4 w-4 text-teal-600" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="center">
                              <span className="text-sm font-medium">Carry-on: {carryOnWeight} kg</span>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="p-0.5">
                            <Briefcase className="h-4 w-4 text-gray-300" />
                          </span>
                        )}
                        {/* Valija */}
                        {hasCheckedBag ? (
                          <Popover>
                            <PopoverTrigger asChild>
                              <button className="p-0.5 hover:bg-gray-100 rounded" title="Valija incluida">
                                <Luggage className="h-4 w-4 text-teal-600" />
                              </button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-2" align="center">
                              <span className="text-sm font-medium">
                                Valija: {checkedBagWeight} kg {checkedBagsQty > 1 ? `(x${checkedBagsQty})` : ''}
                              </span>
                            </PopoverContent>
                          </Popover>
                        ) : (
                          <span className="p-0.5">
                            <Luggage className="h-4 w-4 text-gray-300" />
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {nights}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      {quantity}
                    </TableCell>
                    <TableCell className="text-center">
                      {sold}
                    </TableCell>
                    <TableCell className="text-center font-medium">
                      <span className={remaining <= 5 ? 'text-red-600' : remaining <= 10 ? 'text-yellow-600' : ''}>
                        {remaining}
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <span className={`text-sm font-medium ${
                        expInfo.status === 'danger'
                          ? 'text-red-600'
                          : expInfo.status === 'warning'
                            ? 'text-green-600'
                            : ''
                      }`}>
                        {expInfo.dateStr}
                        <span className="text-xs text-muted-foreground ml-1">
                          ({expInfo.daysUntil}d)
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        className={syncStatusStyles[flight.sync_status as keyof typeof syncStatusStyles]}
                      >
                        {syncStatusLabels[flight.sync_status as keyof typeof syncStatusLabels]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {pairedFlight ? (
                        <div className="flex flex-col gap-0.5">
                          {flight.tc_transport_id && (
                            <span className="text-blue-600" title="Ida">
                              {flight.tc_transport_id}
                            </span>
                          )}
                          {pairedFlight.tc_transport_id && (
                            <span className="text-purple-600" title="Vuelta">
                              {pairedFlight.tc_transport_id}
                            </span>
                          )}
                          {!flight.tc_transport_id && !pairedFlight.tc_transport_id && (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </div>
                      ) : flight.tc_transport_id ? (
                        <span>{flight.tc_transport_id}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {flight.last_sync_at
                        ? formatDateTime(flight.last_sync_at)
                        : 'Nunca'
                      }
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          title="Editar"
                        >
                          <Link href={`/flights/${flight.id}`}>
                            <Pencil className="h-4 w-4" />
                          </Link>
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyClick(flight)}
                          title="Copiar cupo"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            if (pairedFlight) {
                              // For paired flights: sync RETURN first, then OUTBOUND
                              // This ensures the outbound can link to return's TC ID
                              const outboundFlight = flight.leg_type === 'outbound' ? flight : pairedFlight
                              const returnFlt = flight.leg_type === 'return' ? flight : pairedFlight

                              // 1. Sync return flight first
                              await handleSyncClick(returnFlt.id)
                              // 2. Then sync outbound (will link to return's TC ID)
                              await handleSyncClick(outboundFlight.id)
                              router.refresh()
                            } else {
                              await handleSyncClick(flight.id)
                              router.refresh()
                            }
                          }}
                          disabled={syncingFlightId === flight.id || !!(pairedFlight && syncingFlightId === pairedFlight.id)}
                          title={pairedFlight ? 'Sincronizar ambos (Vuelta → Ida)' : 'Sincronizar TC'}
                        >
                          {syncingFlightId === flight.id || (pairedFlight && syncingFlightId === pairedFlight.id) ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteClick(flight)}
                          disabled={deletingFlightId === flight.id}
                          title={pairedFlight ? 'Eliminar ambos' : 'Eliminar'}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          {deletingFlightId === flight.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CopyFlightDialog
        flight={selectedFlight}
        open={copyDialogOpen}
        onOpenChange={setCopyDialogOpen}
        onSuccess={handleCopySuccess}
      />

      {/* Delete confirmation dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar vuelo?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {flightToDelete && getPairedFlight(flightToDelete) ? (
                  <p>
                    Se eliminarán los vuelos de <strong>Ida</strong> y <strong>Vuelta</strong> enlazados.
                    Esta acción no se puede deshacer.
                  </p>
                ) : (
                  <p>
                    Se eliminará el vuelo <strong>{flightToDelete?.name}</strong>.
                    Esta acción no se puede deshacer.
                  </p>
                )}
                {flightToDelete && (flightToDelete.tc_transport_id || getPairedFlight(flightToDelete)?.tc_transport_id) ? (() => {
                  const paired = getPairedFlight(flightToDelete)
                  const hasMultipleTcIds = flightToDelete.tc_transport_id && paired?.tc_transport_id
                  return (
                    <div className="mt-2 text-amber-600 font-medium">
                      <p>Este vuelo está sincronizado con TravelCompositor:</p>
                      <ul className="list-disc list-inside mt-1 text-sm">
                        {flightToDelete.tc_transport_id && (
                          <li>
                            TC ID {hasMultipleTcIds ? (flightToDelete.leg_type === 'outbound' ? 'Ida' : 'Vuelta') : ''}:
                            <span className="font-mono ml-1">{flightToDelete.tc_transport_id}</span>
                          </li>
                        )}
                        {paired?.tc_transport_id && (
                          <li>
                            TC ID {hasMultipleTcIds ? (paired.leg_type === 'return' ? 'Vuelta' : 'Ida') : ''}:
                            <span className="font-mono ml-1">{paired.tc_transport_id}</span>
                          </li>
                        )}
                      </ul>
                      <p className="mt-2">¿Desea desactivar{hasMultipleTcIds ? 'los' : 'lo'} también en TC?</p>
                    </div>
                  )
                })() : (
                  <p className="mt-2 text-muted-foreground text-sm">
                    Este vuelo no está sincronizado con TravelCompositor.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel className="sm:order-1">Cancelar</AlertDialogCancel>
            {flightToDelete && (flightToDelete.tc_transport_id || getPairedFlight(flightToDelete)?.tc_transport_id) ? (
              <>
                <AlertDialogAction
                  onClick={() => handleDeleteConfirm(false)}
                  className="bg-gray-600 hover:bg-gray-700 whitespace-nowrap sm:order-2"
                >
                  Solo local
                </AlertDialogAction>
                <AlertDialogAction
                  onClick={() => handleDeleteConfirm(true)}
                  className="bg-red-600 hover:bg-red-700 whitespace-nowrap sm:order-3"
                >
                  Eliminar y desactivar en TC
                </AlertDialogAction>
              </>
            ) : (
              <AlertDialogAction
                onClick={() => handleDeleteConfirm(false)}
                className="bg-red-600 hover:bg-red-700 sm:order-2"
              >
                Eliminar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Bulk delete confirmation dialog */}
      <AlertDialog open={bulkDeleteDialogOpen} onOpenChange={setBulkDeleteDialogOpen}>
        <AlertDialogContent className="sm:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar {selectedIds.size} vuelo(s)?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <p>
                  Se eliminarán <strong>{selectedIds.size}</strong> vuelo(s) seleccionado(s) y sus vuelos pareados.
                  Esta acción no se puede deshacer.
                </p>
                {(() => {
                  // Count how many selected flights have TC IDs
                  let tcCount = 0
                  selectedIds.forEach(id => {
                    const flight = flights.find(f => f.id === id)
                    if (flight?.tc_transport_id) tcCount++
                    const paired = flight ? getPairedFlight(flight) : null
                    if (paired?.tc_transport_id) tcCount++
                  })
                  if (tcCount > 0) {
                    return (
                      <div className="mt-2 text-amber-600 font-medium">
                        <p>{tcCount} vuelo(s) están sincronizados con TravelCompositor.</p>
                        <p className="mt-2">¿Desea desactivarlos también en TC?</p>
                      </div>
                    )
                  }
                  return (
                    <p className="mt-2 text-muted-foreground text-sm">
                      Ninguno de los vuelos seleccionados está sincronizado con TravelCompositor.
                    </p>
                  )
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2 sm:flex-row sm:gap-2">
            <AlertDialogCancel className="sm:order-1">Cancelar</AlertDialogCancel>
            {(() => {
              // Check if any selected flights have TC IDs
              let hasTcFlights = false
              selectedIds.forEach(id => {
                const flight = flights.find(f => f.id === id)
                if (flight?.tc_transport_id) hasTcFlights = true
                const paired = flight ? getPairedFlight(flight) : null
                if (paired?.tc_transport_id) hasTcFlights = true
              })
              if (hasTcFlights) {
                return (
                  <>
                    <AlertDialogAction
                      onClick={() => handleBulkDelete(false)}
                      className="bg-gray-600 hover:bg-gray-700 whitespace-nowrap sm:order-2"
                    >
                      Solo local
                    </AlertDialogAction>
                    <AlertDialogAction
                      onClick={() => handleBulkDelete(true)}
                      className="bg-red-600 hover:bg-red-700 whitespace-nowrap sm:order-3"
                    >
                      Eliminar y desactivar en TC
                    </AlertDialogAction>
                  </>
                )
              }
              return (
                <AlertDialogAction
                  onClick={() => handleBulkDelete(false)}
                  className="bg-red-600 hover:bg-red-700 sm:order-2"
                >
                  Eliminar
                </AlertDialogAction>
              )
            })()}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
