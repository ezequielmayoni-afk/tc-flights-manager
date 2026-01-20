'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Plane,
  Hotel,
  Car,
  MoreHorizontal,
  Ticket,
  Map,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
  Palette,
  Megaphone,
  EyeOff,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Eye,
  EyeOff as MonitorOff,
  Moon,
  RotateCcw,
  Luggage,
  Briefcase,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { DesignModal } from './DesignModal'

type PackageWithDestinations = {
  id: number
  tc_package_id: number
  title: string
  large_title: string | null
  image_url: string | null
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  original_price_per_pax: number | null
  current_price_per_pax: number | null
  total_price: number | null
  currency: string
  price_variance_pct: number | null
  adults_count: number
  children_count: number
  nights_count: number
  destinations_count: number
  transports_count: number
  hotels_count: number
  transfers_count: number
  cars_count: number
  tickets_count: number
  tours_count: number
  tc_active: boolean
  status: string
  send_to_design: boolean
  send_to_marketing: boolean
  themes: string[]
  tc_idea_url: string | null
  tc_creation_date: string | null
  created_at: string
  last_sync_at: string | null
  last_price_change_at: string | null
  air_cost: number | null
  land_cost: number | null
  agency_fee: number | null
  flight_departure_date: string | null
  airline_code: string | null
  airline_name: string | null
  flight_numbers: string | null
  // Monitoring fields
  monitor_enabled: boolean
  target_price: number | null
  requote_status: 'pending' | 'checking' | 'needs_manual' | 'completed' | null
  last_requote_at: string | null
  requote_price: number | null
  requote_variance_pct: number | null
  package_destinations: {
    destination_code: string
    destination_name: string
  }[]
  package_hotels: {
    hotel_name: string | null
    board_type: string | null
  }[]
  package_transports: {
    baggage_info: string | null
    checked_baggage: string | null
    cabin_baggage: string | null
  }[]
}

interface PackagesTableProps {
  packages: PackageWithDestinations[]
}

type SortField = 'tc_creation_date' | 'tc_package_id' | 'title' | 'date_range_start' | 'flight_departure_date' | 'air_cost' | 'land_cost' | 'agency_fee' | 'current_price_per_pax' | 'status' | 'monitor_enabled' | 'target_price' | 'requote_price' | 'last_requote_at' | 'nights_count'
type SortDirection = 'asc' | 'desc'

type BulkActionResult = {
  id: number
  tc_package_id: number
  title: string
  status: 'success' | 'error'
  error?: string
}

const statusColors: Record<string, string> = {
  imported: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  in_design: 'bg-purple-100 text-purple-700',
  in_marketing: 'bg-orange-100 text-orange-700',
  published: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
}

const statusLabels: Record<string, string> = {
  imported: 'Importado',
  reviewing: 'En revisión',
  approved: 'Aprobado',
  in_design: 'En diseño',
  in_marketing: 'En marketing',
  published: 'Publicado',
  expired: 'Vencido',
}

// Column configuration for resizable columns
type ColumnKey = 'checkbox' | 'fecha' | 'id' | 'nombre' | 'noches' | 'salida' | 'vuelo' | 'costoAereo' | 'tierra' | 'fee' | 'finalPax' | 'servicios' | 'estado' | 'monitoreo' | 'precioObj' | 'ultRecot' | 'fechaRecot' | 'actions'

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  checkbox: 40,
  fecha: 96,
  id: 80,
  nombre: 160,
  noches: 80,
  salida: 128,
  vuelo: 96,
  costoAereo: 160,
  tierra: 160,
  fee: 96,
  finalPax: 112,
  servicios: 96,
  estado: 96,
  monitoreo: 112,
  precioObj: 112,
  ultRecot: 112,
  fechaRecot: 112,
  actions: 40,
}

const MIN_COLUMN_WIDTH = 50
const STORAGE_KEY = 'packages-table-column-widths'

function loadColumnWidths(): Record<ColumnKey, number> {
  if (typeof window === 'undefined') return DEFAULT_COLUMN_WIDTHS
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      return { ...DEFAULT_COLUMN_WIDTHS, ...parsed }
    }
  } catch {
    // Ignore errors
  }
  return DEFAULT_COLUMN_WIDTHS
}

function saveColumnWidths(widths: Record<ColumnKey, number>) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(widths))
  } catch {
    // Ignore errors
  }
}

function formatCurrency(amount: number | null, currency: string): string {
  if (amount === null || amount === 0) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  })
}

function isExpired(dateRangeEnd: string | null): boolean {
  if (!dateRangeEnd) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(dateRangeEnd)
  return endDate < today
}

function createSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

function buildPackageUrl(packageId: number, title: string): string {
  const slug = createSlug(title)
  return `https://www.siviajo.com/es/idea/${packageId}/${slug}`
}

// Resize handle component
interface ResizeHandleProps {
  columnKey: ColumnKey
  onResize: (key: ColumnKey, delta: number) => void
  onResizeEnd: () => void
}

function ResizeHandle({ columnKey, onResize, onResizeEnd }: ResizeHandleProps) {
  const handleRef = useRef<HTMLDivElement>(null)
  const startXRef = useRef<number>(0)
  const isDraggingRef = useRef(false)

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    isDraggingRef.current = true
    startXRef.current = e.clientX

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current) return
      const delta = moveEvent.clientX - startXRef.current
      startXRef.current = moveEvent.clientX
      onResize(columnKey, delta)
    }

    const handleMouseUp = () => {
      isDraggingRef.current = false
      onResizeEnd()
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [columnKey, onResize, onResizeEnd])

  return (
    <div
      ref={handleRef}
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-blue-500 active:bg-blue-600 group-hover:bg-gray-300"
      style={{ touchAction: 'none' }}
    />
  )
}

interface ResizableHeaderProps {
  label: string
  columnKey: ColumnKey
  width: number
  field?: SortField
  currentSort?: SortField | null
  direction?: SortDirection
  onSort?: (field: SortField) => void
  onResize: (key: ColumnKey, delta: number) => void
  onResizeEnd: () => void
  centered?: boolean
  children?: React.ReactNode
}

function ResizableHeader({
  label,
  columnKey,
  width,
  field,
  currentSort,
  direction,
  onSort,
  onResize,
  onResizeEnd,
  centered = false,
  children,
}: ResizableHeaderProps) {
  const isActive = field && currentSort === field
  const isSortable = field && onSort

  const handleClick = () => {
    if (isSortable && field) {
      onSort(field)
    }
  }

  return (
    <TableHead
      className={`relative group ${isSortable ? 'cursor-pointer hover:bg-muted/50' : ''}`}
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
      onClick={handleClick}
    >
      <div className={`flex items-center gap-1 text-xs pr-2 ${centered ? 'justify-center' : ''}`}>
        {children || (
          <>
            {label}
            {isSortable && (
              isActive ? (
                direction === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
              ) : (
                <ArrowUpDown className="h-3 w-3 opacity-30" />
              )
            )}
          </>
        )}
      </div>
      <ResizeHandle columnKey={columnKey} onResize={onResize} onResizeEnd={onResizeEnd} />
    </TableHead>
  )
}

const ITEMS_PER_PAGE_OPTIONS = [10, 25, 50, 100]

export function PackagesTable({ packages }: PackagesTableProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [sortField, setSortField] = useState<SortField | null>('tc_creation_date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [searchText, setSearchText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [monitorFilter, setMonitorFilter] = useState<string>('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(25)
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [bulkActionLoading, setBulkActionLoading] = useState<string | null>(null)
  const [bulkActionResults, setBulkActionResults] = useState<BulkActionResult[] | null>(null)
  const [requoteRunning, setRequoteRunning] = useState(false)
  const [requoteStatus, setRequoteStatus] = useState('')
  const [requoteCurrentPackage, setRequoteCurrentPackage] = useState<string | null>(null)
  const [requoteProgress, setRequoteProgress] = useState<{
    total?: number
    completed: { id: number; title: string; status: string; variance?: string }[]
  }>({ completed: [] })
  const [requoteResult, setRequoteResult] = useState<{
    success: boolean
    summary?: {
      processed: number
      success: number
      errors: number
      needsManual: number
      autoUpdated: number
      noChange: number
      duration: string
      packages: { id: number; title: string; status: string; variance?: string }[]
    }
    error?: string
  } | null>(null)
  const [designModalPackage, setDesignModalPackage] = useState<{ id: number; title: string } | null>(null)

  // Column widths state with localStorage persistence
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS)

  // Load column widths from localStorage on mount
  useEffect(() => {
    setColumnWidths(loadColumnWidths())
  }, [])

  // Handle column resize
  const handleColumnResize = useCallback((key: ColumnKey, delta: number) => {
    setColumnWidths(prev => {
      const newWidth = Math.max(MIN_COLUMN_WIDTH, prev[key] + delta)
      return { ...prev, [key]: newWidth }
    })
  }, [])

  // Save column widths when resize ends
  const handleResizeEnd = useCallback(() => {
    saveColumnWidths(columnWidths)
  }, [columnWidths])

  // Reset column widths to defaults
  const resetColumnWidths = useCallback(() => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS)
    saveColumnWidths(DEFAULT_COLUMN_WIDTHS)
  }, [])

  // Realtime subscription for packages updates
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('packages-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
        },
        (payload) => {
          console.log('[Realtime] Package updated:', payload)
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDirection('desc')
    }
  }

  const filteredAndSortedPackages = useMemo(() => {
    let result = [...packages]

    // Filter by search text
    if (searchText) {
      const search = searchText.toLowerCase()
      result = result.filter(pkg =>
        pkg.title.toLowerCase().includes(search) ||
        pkg.tc_package_id.toString().includes(search) ||
        pkg.package_destinations?.some(d => d.destination_name.toLowerCase().includes(search))
      )
    }

    // Filter by status
    if (statusFilter !== 'all') {
      if (statusFilter === 'expired') {
        result = result.filter(pkg => isExpired(pkg.date_range_end))
      } else {
        result = result.filter(pkg => pkg.status === statusFilter && !isExpired(pkg.date_range_end))
      }
    }

    // Filter by monitor status
    if (monitorFilter !== 'all') {
      switch (monitorFilter) {
        case 'monitoring':
          result = result.filter(pkg => pkg.monitor_enabled)
          break
        case 'needs_manual':
          result = result.filter(pkg => pkg.requote_status === 'needs_manual')
          break
        case 'pending':
          result = result.filter(pkg => pkg.requote_status === 'pending')
          break
        case 'completed':
          result = result.filter(pkg => pkg.requote_status === 'completed')
          break
      }
    }

    // Sort
    if (sortField) {
      result.sort((a, b) => {
        let aVal: string | number | null = null
        let bVal: string | number | null = null

        switch (sortField) {
          case 'tc_creation_date':
            aVal = a.tc_creation_date ? new Date(a.tc_creation_date).getTime() : 0
            bVal = b.tc_creation_date ? new Date(b.tc_creation_date).getTime() : 0
            break
          case 'tc_package_id':
            aVal = a.tc_package_id
            bVal = b.tc_package_id
            break
          case 'title':
            aVal = a.title.toLowerCase()
            bVal = b.title.toLowerCase()
            break
          case 'date_range_start':
            aVal = a.date_range_start ? new Date(a.date_range_start).getTime() : 0
            bVal = b.date_range_start ? new Date(b.date_range_start).getTime() : 0
            break
          case 'flight_departure_date':
            aVal = a.flight_departure_date ? new Date(a.flight_departure_date).getTime() : 0
            bVal = b.flight_departure_date ? new Date(b.flight_departure_date).getTime() : 0
            break
          case 'air_cost':
            aVal = a.air_cost || 0
            bVal = b.air_cost || 0
            break
          case 'land_cost':
            aVal = a.land_cost || 0
            bVal = b.land_cost || 0
            break
          case 'agency_fee':
            aVal = a.agency_fee || 0
            bVal = b.agency_fee || 0
            break
          case 'current_price_per_pax':
            aVal = a.current_price_per_pax || 0
            bVal = b.current_price_per_pax || 0
            break
          case 'status':
            aVal = isExpired(a.date_range_end) ? 'expired' : a.status
            bVal = isExpired(b.date_range_end) ? 'expired' : b.status
            break
          case 'monitor_enabled':
            // Sort by: needs_manual first, then pending, then completed, then disabled
            const getMonitorOrder = (pkg: PackageWithDestinations) => {
              if (!pkg.monitor_enabled) return 4
              if (pkg.requote_status === 'needs_manual') return 0
              if (pkg.requote_status === 'pending') return 1
              if (pkg.requote_status === 'checking') return 2
              if (pkg.requote_status === 'completed') return 3
              return 4
            }
            aVal = getMonitorOrder(a)
            bVal = getMonitorOrder(b)
            break
          case 'target_price':
            aVal = a.target_price || 0
            bVal = b.target_price || 0
            break
          case 'requote_price':
            aVal = a.requote_price || 0
            bVal = b.requote_price || 0
            break
          case 'last_requote_at':
            aVal = a.last_requote_at ? new Date(a.last_requote_at).getTime() : 0
            bVal = b.last_requote_at ? new Date(b.last_requote_at).getTime() : 0
            break
        }

        if (aVal === null || bVal === null) return 0
        if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
        if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
        return 0
      })
    }

    return result
  }, [packages, searchText, statusFilter, monitorFilter, sortField, sortDirection])

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedPackages.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedPackages = filteredAndSortedPackages.slice(startIndex, endIndex)

  // Reset to page 1 when filters change
  const handleFilterChange = (newSearch: string) => {
    setSearchText(newSearch)
    setCurrentPage(1)
  }

  const handleStatusChange = (newStatus: string) => {
    setStatusFilter(newStatus)
    setCurrentPage(1)
  }

  const handleMonitorFilterChange = (newFilter: string) => {
    setMonitorFilter(newFilter)
    setCurrentPage(1)
  }

  const handleItemsPerPageChange = (value: string) => {
    setItemsPerPage(Number(value))
    setCurrentPage(1)
  }

  const toggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === paginatedPackages.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(paginatedPackages.map(p => p.id)))
    }
  }

  const clearFilters = () => {
    setSearchText('')
    setStatusFilter('all')
    setMonitorFilter('all')
  }

  const handleRefreshPackage = async (packageId: number) => {
    setRefreshingId(packageId)
    try {
      const response = await fetch(`/api/packages/${packageId}/refresh`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el paquete')
      }

      if (data.priceChanged) {
        toast.success(`Precio actualizado: ${data.variancePct > 0 ? '+' : ''}${data.variancePct.toFixed(1)}%`)
      } else {
        toast.success('Paquete actualizado correctamente')
      }

      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar el paquete')
    } finally {
      setRefreshingId(null)
    }
  }

  const hasFilters = searchText || statusFilter !== 'all' || monitorFilter !== 'all'

  const handleRunRequote = async () => {
    setRequoteRunning(true)
    setRequoteResult(null)
    setRequoteStatus('Preparando...')
    setRequoteCurrentPackage(null)
    setRequoteProgress({ completed: [] })

    try {
      // Get selected package IDs (if any)
      const packageIdsToProcess = selectedIds.size > 0 ? Array.from(selectedIds) : []

      // Run the bot with SSE streaming, passing specific package IDs if selected
      // If no packages selected, the bot will run in batch mode (all pending packages)
      const response = await fetch('/api/requote/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: packageIdsToProcess }),
      })

      if (!response.body) {
        throw new Error('No response body')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))

              switch (event.type) {
                case 'status':
                  setRequoteStatus(event.message)
                  if (event.total) {
                    setRequoteProgress(prev => ({ ...prev, total: event.total }))
                  }
                  break
                case 'package_start':
                  setRequoteCurrentPackage(`Verificando ${event.tcId}...`)
                  break
                case 'package_info':
                  setRequoteCurrentPackage(event.title)
                  break
                case 'package_status':
                  setRequoteStatus(event.message)
                  break
                case 'package_variance':
                  setRequoteStatus(`Variación: ${event.variance}`)
                  break
                case 'package_done':
                  setRequoteProgress(prev => ({
                    ...prev,
                    completed: [...prev.completed, {
                      id: event.id,
                      title: event.title,
                      status: event.status,
                      variance: event.variance,
                    }]
                  }))
                  setRequoteCurrentPackage(null)
                  break
                case 'complete':
                  setRequoteResult({
                    success: event.success,
                    summary: event.summary,
                  })
                  if (event.success) {
                    toast.success(`Monitoreo completado: ${event.summary?.processed || 0} paquetes`)
                  }
                  break
                case 'error':
                  setRequoteResult({
                    success: false,
                    error: event.message,
                  })
                  toast.error(event.message)
                  break
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }

      setSelectedIds(new Set())
      router.refresh()
    } catch (error) {
      setRequoteResult({
        success: false,
        error: error instanceof Error ? error.message : 'Error de conexión',
      })
      toast.error('Error al ejecutar el monitoreo')
    } finally {
      setRequoteRunning(false)
    }
  }

  const handleBulkAction = async (action: 'design' | 'marketing' | 'expired' | 'delete' | 'monitor' | 'unmonitor' | 'run_requote') => {
    if (selectedIds.size === 0) return

    // Handle run_requote separately
    if (action === 'run_requote') {
      handleRunRequote()
      return
    }

    // Confirmation for delete action
    if (action === 'delete') {
      const confirmed = window.confirm(
        `¿Estás seguro de eliminar ${selectedIds.size} paquete${selectedIds.size > 1 ? 's' : ''}?\n\nEsta acción:\n• Desactivará los paquetes en TravelCompositor\n• Eliminará los paquetes y todos sus datos relacionados de la base de datos\n\nEsta acción no se puede deshacer.`
      )
      if (!confirmed) return
    }

    setBulkActionLoading(action)
    try {
      const response = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: Array.from(selectedIds),
          action,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al ejecutar la acción')
      }

      // Show results modal
      setBulkActionResults(data.results)

      const actionLabels = {
        design: 'enviados a diseño',
        marketing: 'enviados a marketing',
        expired: 'marcados como no visibles',
        delete: 'eliminados',
        monitor: 'activados para monitoreo',
        unmonitor: 'desactivados de monitoreo',
        run_requote: 'marcados para ejecutar monitoreo',
      }

      if (data.errors > 0) {
        toast.warning(`${data.updated} paquetes ${actionLabels[action]}, ${data.errors} con errores`)
      } else {
        toast.success(`${data.updated} paquetes ${actionLabels[action]}`)
      }

      setSelectedIds(new Set())
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al ejecutar la acción')
    } finally {
      setBulkActionLoading(null)
    }
  }

  return (
    <div>
      {/* Filters */}
      <div className="p-4 border-b flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, ID o destino..."
            value={searchText}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="imported">Importado</SelectItem>
            <SelectItem value="reviewing">En revisión</SelectItem>
            <SelectItem value="approved">Aprobado</SelectItem>
            <SelectItem value="in_design">En diseño</SelectItem>
            <SelectItem value="in_marketing">En marketing</SelectItem>
            <SelectItem value="published">Publicado</SelectItem>
            <SelectItem value="expired">Vencido</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monitorFilter} onValueChange={handleMonitorFilterChange}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Monitoreo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="monitoring">En monitoreo</SelectItem>
            <SelectItem value="needs_manual">Requiere recotización</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
          </SelectContent>
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            Limpiar
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={resetColumnWidths}
          title="Restablecer anchos de columna"
        >
          <RotateCcw className="h-4 w-4" />
        </Button>
        <div className="text-sm text-muted-foreground ml-auto">
          {filteredAndSortedPackages.length} de {packages.length} paquetes
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="p-3 bg-blue-50 border-b flex items-center gap-4">
          <span className="text-sm font-medium text-blue-700">
            {selectedIds.size} paquete{selectedIds.size > 1 ? 's' : ''} seleccionado{selectedIds.size > 1 ? 's' : ''}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('design')}
              disabled={bulkActionLoading !== null}
              className="gap-2"
            >
              {bulkActionLoading === 'design' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Palette className="h-4 w-4" />
              )}
              Enviar a Diseño
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('monitor')}
              disabled={bulkActionLoading !== null}
              className="gap-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
            >
              {bulkActionLoading === 'monitor' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
              Activar Monitoreo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('run_requote')}
              disabled={bulkActionLoading !== null}
              className="gap-2 text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              {bulkActionLoading === 'run_requote' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Ejecutar Monitoreo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('unmonitor')}
              disabled={bulkActionLoading !== null}
              className="gap-2"
            >
              {bulkActionLoading === 'unmonitor' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MonitorOff className="h-4 w-4" />
              )}
              Desactivar Monitoreo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBulkAction('expired')}
              disabled={bulkActionLoading !== null}
              className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
            >
              {bulkActionLoading === 'expired' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <EyeOff className="h-4 w-4" />
              )}
              Marcar No Visible
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => handleBulkAction('delete')}
              disabled={bulkActionLoading !== null}
              className="gap-2"
            >
              {bulkActionLoading === 'delete' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Eliminar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedIds(new Set())}
              disabled={bulkActionLoading !== null}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <ResizableHeader
                label=""
                columnKey="checkbox"
                width={columnWidths.checkbox}
                onResize={handleColumnResize}
                onResizeEnd={handleResizeEnd}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.size === paginatedPackages.length && paginatedPackages.length > 0}
                  onChange={toggleSelectAll}
                  className="rounded border-gray-300"
                />
              </ResizableHeader>
              <ResizableHeader label="Fecha" columnKey="fecha" width={columnWidths.fecha} field="tc_creation_date" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="ID" columnKey="id" width={columnWidths.id} field="tc_package_id" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Nombre" columnKey="nombre" width={columnWidths.nombre} field="title" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Noches" columnKey="noches" width={columnWidths.noches} field="nights_count" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Salida" columnKey="salida" width={columnWidths.salida} field="date_range_start" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Vuelo" columnKey="vuelo" width={columnWidths.vuelo} field="flight_departure_date" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Costo Aéreo" columnKey="costoAereo" width={columnWidths.costoAereo} field="air_cost" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Tierra" columnKey="tierra" width={columnWidths.tierra} field="land_cost" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Fee" columnKey="fee" width={columnWidths.fee} field="agency_fee" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Final/pax" columnKey="finalPax" width={columnWidths.finalPax} field="current_price_per_pax" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Servicios" columnKey="servicios" width={columnWidths.servicios} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Estado" columnKey="estado" width={columnWidths.estado} field="status" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Monitoreo" columnKey="monitoreo" width={columnWidths.monitoreo} field="monitor_enabled" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Precio Obj." columnKey="precioObj" width={columnWidths.precioObj} field="target_price" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Últ. Recot." columnKey="ultRecot" width={columnWidths.ultRecot} field="requote_price" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Fecha Recot." columnKey="fechaRecot" width={columnWidths.fechaRecot} field="last_requote_at" currentSort={sortField} direction={sortDirection} onSort={handleSort} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="" columnKey="actions" width={columnWidths.actions} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedPackages.length === 0 ? (
              <TableRow>
                <TableCell colSpan={18} className="text-center py-12 text-muted-foreground">
                  {packages.length === 0
                    ? 'No hay paquetes importados. Usa el botón "Importar desde TC" para comenzar.'
                    : 'No se encontraron paquetes con los filtros aplicados.'}
                </TableCell>
              </TableRow>
            ) : (
              paginatedPackages.map((pkg) => {
                const expired = isExpired(pkg.date_range_end)
                // Determinar estado real basado en booleanos, no en el campo status
                const displayStatus = expired
                  ? 'expired'
                  : pkg.send_to_marketing
                    ? 'in_marketing'
                    : pkg.send_to_design
                      ? 'in_design'
                      : pkg.status

                return (
                  <TableRow key={pkg.id} className={!pkg.tc_active || expired ? 'opacity-60' : ''}>
                    <TableCell style={{ width: columnWidths.checkbox, minWidth: columnWidths.checkbox, maxWidth: columnWidths.checkbox }}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(pkg.id)}
                        onChange={() => toggleSelect(pkg.id)}
                        className="rounded border-gray-300"
                      />
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap" style={{ width: columnWidths.fecha, minWidth: columnWidths.fecha, maxWidth: columnWidths.fecha }}>
                      {formatDate(pkg.tc_creation_date)}
                    </TableCell>

                    <TableCell className="text-xs font-mono text-muted-foreground" style={{ width: columnWidths.id, minWidth: columnWidths.id, maxWidth: columnWidths.id }}>
                      {pkg.tc_package_id}
                    </TableCell>

                    <TableCell style={{ width: columnWidths.nombre, minWidth: columnWidths.nombre, maxWidth: columnWidths.nombre }}>
                      <div className="min-w-0">
                        <a
                          href={buildPackageUrl(pkg.tc_package_id, pkg.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-sm hover:underline line-clamp-2 text-blue-600"
                        >
                          {pkg.title}
                        </a>
                      </div>
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.noches, minWidth: columnWidths.noches, maxWidth: columnWidths.noches }}>
                      {pkg.nights_count ? (
                        <div className="flex items-center justify-center gap-1">
                          <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{pkg.nights_count}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs whitespace-nowrap" style={{ width: columnWidths.salida, minWidth: columnWidths.salida, maxWidth: columnWidths.salida }}>
                      {pkg.date_range_start && pkg.date_range_end ? (
                        <span>
                          {formatShortDate(pkg.date_range_start)} → {formatShortDate(pkg.date_range_end)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs whitespace-nowrap" style={{ width: columnWidths.vuelo, minWidth: columnWidths.vuelo, maxWidth: columnWidths.vuelo }}>
                      {formatShortDate(pkg.flight_departure_date)}
                    </TableCell>

                    <TableCell style={{ width: columnWidths.costoAereo, minWidth: columnWidths.costoAereo, maxWidth: columnWidths.costoAereo }}>
                      <div className="text-xs">
                        <div className="font-medium">
                          {formatCurrency(pkg.air_cost, pkg.currency)}
                        </div>
                        {pkg.air_cost && (pkg.adults_count + pkg.children_count) > 0 && (
                          <div className="text-muted-foreground">
                            {formatCurrency(pkg.air_cost / (pkg.adults_count + pkg.children_count), pkg.currency)}/pax
                          </div>
                        )}
                        {(pkg.airline_code || pkg.flight_numbers) && (
                          <div className="text-muted-foreground truncate">
                            {pkg.airline_code || ''} {pkg.flight_numbers ? `(${pkg.flight_numbers})` : ''}
                          </div>
                        )}
                        {/* Baggage info */}
                        {pkg.package_transports?.[0] && (pkg.package_transports[0].baggage_info || pkg.package_transports[0].checked_baggage || pkg.package_transports[0].cabin_baggage) && (
                          <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
                            {/* Show baggage_info if available (TC sends this) */}
                            {pkg.package_transports[0].baggage_info && !pkg.package_transports[0].checked_baggage && (
                              <span className="flex items-center gap-0.5" title="Equipaje incluido">
                                <Luggage className="h-3 w-3" />
                                {pkg.package_transports[0].baggage_info}
                              </span>
                            )}
                            {pkg.package_transports[0].checked_baggage && (
                              <span className="flex items-center gap-0.5" title="Equipaje despachado">
                                <Luggage className="h-3 w-3" />
                                {pkg.package_transports[0].checked_baggage}
                              </span>
                            )}
                            {pkg.package_transports[0].cabin_baggage && (
                              <span className="flex items-center gap-0.5" title="Equipaje de mano">
                                <Briefcase className="h-3 w-3" />
                                {pkg.package_transports[0].cabin_baggage}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.tierra, minWidth: columnWidths.tierra, maxWidth: columnWidths.tierra }}>
                      <div className="text-xs">
                        <div className="font-medium">
                          {formatCurrency(pkg.land_cost, pkg.currency)}
                        </div>
                        {pkg.package_hotels?.[0]?.hotel_name && (
                          <div className="text-muted-foreground truncate" title={pkg.package_hotels[0].hotel_name}>
                            {pkg.package_hotels[0].hotel_name}
                          </div>
                        )}
                        {pkg.package_hotels?.[0]?.board_type && (
                          <div className={`${
                            pkg.package_hotels[0].board_type.toUpperCase().includes('ALL INCLUSIVE')
                              ? 'text-green-600 font-medium'
                              : 'text-muted-foreground'
                          }`}>
                            {pkg.package_hotels[0].board_type}
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-xs text-center" style={{ width: columnWidths.fee, minWidth: columnWidths.fee, maxWidth: columnWidths.fee }}>
                      {formatCurrency(pkg.agency_fee, pkg.currency)}
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.finalPax, minWidth: columnWidths.finalPax, maxWidth: columnWidths.finalPax }}>
                      <span className="font-medium text-sm">
                        {formatCurrency(pkg.current_price_per_pax, pkg.currency)}
                      </span>
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.servicios, minWidth: columnWidths.servicios, maxWidth: columnWidths.servicios }}>
                      <div className="flex items-center justify-center gap-1 text-muted-foreground">
                        {pkg.transports_count > 0 && (
                          <div className="flex items-center" title={`${pkg.transports_count} vuelos`}>
                            <Plane className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {pkg.hotels_count > 0 && (
                          <div className="flex items-center" title={`${pkg.hotels_count} hoteles`}>
                            <Hotel className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {pkg.transfers_count > 0 && (
                          <div className="flex items-center" title={`${pkg.transfers_count} transfers`}>
                            <Car className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {pkg.tours_count > 0 && (
                          <div className="flex items-center" title={`${pkg.tours_count} tours`}>
                            <Map className="h-3.5 w-3.5" />
                          </div>
                        )}
                        {pkg.tickets_count > 0 && (
                          <div className="flex items-center" title={`${pkg.tickets_count} tickets`}>
                            <Ticket className="h-3.5 w-3.5" />
                          </div>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.estado, minWidth: columnWidths.estado, maxWidth: columnWidths.estado }}>
                      <Badge className={statusColors[displayStatus] || statusColors.imported}>
                        {statusLabels[displayStatus] || displayStatus}
                      </Badge>
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.monitoreo, minWidth: columnWidths.monitoreo, maxWidth: columnWidths.monitoreo }}>
                      {pkg.monitor_enabled ? (
                        <div className="flex flex-col items-center gap-1">
                          {pkg.requote_status === 'needs_manual' ? (
                            <Badge className="bg-red-100 text-red-700 text-xs">
                              Recotizar
                            </Badge>
                          ) : pkg.requote_status === 'pending' ? (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              Pendiente
                            </Badge>
                          ) : pkg.requote_status === 'checking' ? (
                            <Badge className="bg-yellow-100 text-yellow-700 text-xs">
                              Verificando
                            </Badge>
                          ) : pkg.requote_status === 'completed' ? (
                            <Badge className="bg-green-100 text-green-700 text-xs">
                              OK
                            </Badge>
                          ) : (
                            <Badge className="bg-blue-100 text-blue-700 text-xs">
                              Activo
                            </Badge>
                          )}
                          {pkg.requote_variance_pct !== null && (
                            <span className={`text-xs ${pkg.requote_variance_pct > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {pkg.requote_variance_pct > 0 ? '+' : ''}{pkg.requote_variance_pct.toFixed(1)}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.precioObj, minWidth: columnWidths.precioObj, maxWidth: columnWidths.precioObj }}>
                      {pkg.target_price ? (
                        <span className="text-sm font-medium">
                          {formatCurrency(pkg.target_price, pkg.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-center" style={{ width: columnWidths.ultRecot, minWidth: columnWidths.ultRecot, maxWidth: columnWidths.ultRecot }}>
                      {pkg.requote_price ? (
                        <span className="text-sm font-medium">
                          {formatCurrency(pkg.requote_price, pkg.currency)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap text-center" style={{ width: columnWidths.fechaRecot, minWidth: columnWidths.fechaRecot, maxWidth: columnWidths.fechaRecot }}>
                      {pkg.last_requote_at ? formatDate(pkg.last_requote_at) : '-'}
                    </TableCell>

                    <TableCell style={{ width: columnWidths.actions, minWidth: columnWidths.actions, maxWidth: columnWidths.actions }}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleRefreshPackage(pkg.id)}
                            disabled={refreshingId === pkg.id}
                            className="flex items-center gap-2"
                          >
                            <RefreshCw className={`h-4 w-4 ${refreshingId === pkg.id ? 'animate-spin' : ''}`} />
                            {refreshingId === pkg.id ? 'Actualizando...' : 'Actualizar desde TC'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDesignModalPackage({ id: pkg.id, title: pkg.title })}
                            className="flex items-center gap-2"
                          >
                            <Palette className="h-4 w-4" />
                            Gestionar Creativos
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {filteredAndSortedPackages.length > 0 && (
        <div className="p-4 border-t flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Mostrar</span>
            <Select value={itemsPerPage.toString()} onValueChange={handleItemsPerPageChange}>
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEMS_PER_PAGE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option.toString()}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span>por página</span>
          </div>

          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {startIndex + 1}-{Math.min(endIndex, filteredAndSortedPackages.length)} de {filteredAndSortedPackages.length}
            </span>
          </div>

          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="px-3 text-sm">
              Página {currentPage} de {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Action Results Modal */}
      <Dialog open={bulkActionResults !== null} onOpenChange={() => setBulkActionResults(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Resultados de la acción</DialogTitle>
          </DialogHeader>
          {bulkActionResults && (
            <div className="space-y-4">
              <div className="flex gap-4 text-sm">
                <div className="flex items-center gap-2 text-green-600">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{bulkActionResults.filter(r => r.status === 'success').length} exitosos</span>
                </div>
                <div className="flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-4 w-4" />
                  <span>{bulkActionResults.filter(r => r.status === 'error').length} errores</span>
                </div>
              </div>

              <div className="border rounded-lg divide-y max-h-[400px] overflow-y-auto">
                {bulkActionResults.map((result) => (
                  <div key={result.id} className="p-3 flex items-start gap-3">
                    {result.status === 'success' ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          #{result.tc_package_id}
                        </span>
                        <span className="text-sm font-medium truncate">
                          {result.title}
                        </span>
                      </div>
                      {result.error && (
                        <p className="text-sm text-red-600 mt-1">
                          {result.error}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <Button onClick={() => setBulkActionResults(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Requote Running Modal */}
      <Dialog open={requoteRunning || requoteResult !== null} onOpenChange={(open) => !open && setRequoteResult(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>
              {requoteRunning ? 'Ejecutando Monitoreo...' : 'Resultado del Monitoreo'}
            </DialogTitle>
          </DialogHeader>

          {requoteRunning && (
            <div className="space-y-4">
              {/* Status */}
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-sm font-medium">{requoteStatus}</span>
              </div>

              {/* Current package */}
              {requoteCurrentPackage && (
                <div className="bg-blue-50 rounded-lg p-3">
                  <p className="text-xs text-blue-600 font-medium">Procesando:</p>
                  <p className="text-sm truncate">{requoteCurrentPackage}</p>
                </div>
              )}

              {/* Progress */}
              {requoteProgress.total && (
                <div className="text-xs text-muted-foreground">
                  Progreso: {requoteProgress.completed.length} / {requoteProgress.total}
                </div>
              )}

              {/* Completed packages */}
              {requoteProgress.completed.length > 0 && (
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium mb-2">Completados:</p>
                  <div className="space-y-1">
                    {requoteProgress.completed.map((pkg) => (
                      <div key={pkg.id} className="flex items-center gap-2 text-xs">
                        {pkg.status === 'updated' ? (
                          <CheckCircle2 className="h-3 w-3 text-green-500" />
                        ) : pkg.status === 'needs_manual' ? (
                          <AlertCircle className="h-3 w-3 text-orange-500" />
                        ) : (
                          <RefreshCw className="h-3 w-3 text-gray-400" />
                        )}
                        <span className="truncate flex-1">{pkg.title || `ID ${pkg.id}`}</span>
                        {pkg.variance && (
                          <span className={pkg.variance.startsWith('+') ? 'text-red-500' : 'text-green-500'}>
                            {pkg.variance}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {requoteResult && !requoteRunning && (
            <div className="space-y-4">
              {requoteResult.success ? (
                <>
                  <div className="flex items-center gap-2 text-green-600">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="font-medium">Monitoreo completado</span>
                  </div>

                  {requoteResult.summary && (
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>Procesados:</div>
                        <div className="font-medium">{requoteResult.summary.processed}</div>

                        <div>Actualizados:</div>
                        <div className="font-medium text-green-600">{requoteResult.summary.autoUpdated}</div>

                        <div>Requieren manual:</div>
                        <div className="font-medium text-orange-600">{requoteResult.summary.needsManual}</div>

                        <div>Sin cambios:</div>
                        <div className="font-medium text-muted-foreground">{requoteResult.summary.noChange}</div>

                        <div>Errores:</div>
                        <div className="font-medium text-red-600">{requoteResult.summary.errors}</div>

                        <div>Duración:</div>
                        <div className="font-medium">{requoteResult.summary.duration}</div>
                      </div>

                      {requoteResult.summary.packages.length > 0 && (
                        <div className="border-t pt-3 mt-3">
                          <p className="text-xs font-medium mb-2">Detalle:</p>
                          <div className="space-y-1 max-h-40 overflow-y-auto">
                            {requoteResult.summary.packages.map((pkg) => (
                              <div key={pkg.id} className="flex items-center gap-2 text-xs">
                                {pkg.status === 'updated' ? (
                                  <CheckCircle2 className="h-3 w-3 text-green-500" />
                                ) : pkg.status === 'needs_manual' ? (
                                  <AlertCircle className="h-3 w-3 text-orange-500" />
                                ) : (
                                  <RefreshCw className="h-3 w-3 text-gray-400" />
                                )}
                                <span className="truncate flex-1">{pkg.title || `ID ${pkg.id}`}</span>
                                {pkg.variance && (
                                  <span className={pkg.variance.startsWith('+') ? 'text-red-500' : 'text-green-500'}>
                                    {pkg.variance}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="flex items-start gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Error en el monitoreo</p>
                    <p className="text-sm mt-1">{requoteResult.error}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setRequoteResult(null)}>
                  Cerrar
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Design Modal */}
      {designModalPackage && (
        <DesignModal
          packageId={designModalPackage.id}
          packageTitle={designModalPackage.title}
          open={!!designModalPackage}
          onOpenChange={(open) => !open && setDesignModalPackage(null)}
        />
      )}
    </div>
  )
}
