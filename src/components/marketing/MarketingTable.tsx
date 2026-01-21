'use client'

import { useState, useEffect, Fragment, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
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
import { toast } from 'sonner'
import {
  Loader2,
  Wand2,
  Search,
  RefreshCw,
  Check,
  Upload,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Calendar,
  AlertTriangle,
  PlusCircle,
} from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PackageRowExpanded } from './PackageRowExpanded'
import { CreativeRequestModal } from './CreativeRequestModal'

// Normalize string by removing accents/diacritics
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Column configuration for resizable columns
type ColumnKey = 'id' | 'paquete' | 'rango' | 'vencimiento' | 'campaignId' | 'adsetId' | 'copies' | 'creativos' | 'ads' | 'status' | 'actions'

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  id: 90,
  paquete: 200,
  rango: 120,
  vencimiento: 110,
  campaignId: 160,
  adsetId: 160,
  copies: 70,
  creativos: 90,
  ads: 60,
  status: 70,
  actions: 50,
}

const MIN_COLUMN_WIDTH = 50
const STORAGE_KEY = 'marketing-table-column-widths'

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
      className="absolute right-0 top-0 h-full w-[4px] cursor-col-resize hover:bg-blue-500 active:bg-blue-600 group-hover:bg-gray-300 transition-colors"
      style={{ touchAction: 'none' }}
    />
  )
}

interface ResizableHeaderProps {
  label: string
  columnKey: ColumnKey
  width: number
  onResize: (key: ColumnKey, delta: number) => void
  onResizeEnd: () => void
  centered?: boolean
}

function ResizableHeader({
  label,
  columnKey,
  width,
  onResize,
  onResizeEnd,
  centered = false,
}: ResizableHeaderProps) {
  return (
    <TableHead
      className="relative group"
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
    >
      <div className={`flex items-center gap-1 text-xs pr-2 ${centered ? 'justify-center' : ''}`}>
        {label}
      </div>
      <ResizeHandle columnKey={columnKey} onResize={onResize} onResizeEnd={onResizeEnd} />
    </TableHead>
  )
}

interface Package {
  id: number
  tc_package_id: number
  title: string
  current_price_per_pax: number
  currency: string
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  nights_count: number
  marketing_status: string
  marketing_expiration_date: string | null
  ads_created_count: number
  total_ad_spend: number
  total_leads: number
  creative_update_needed?: boolean
  creative_update_reason?: string | null
  price_at_creative_creation?: number | null
}

interface MarketingTableProps {
  packages: Package[]
}

type StatusFilter = 'all' | 'pending' | 'copy_generated' | 'ready' | 'active' | 'needs_update'

const STATUS_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'pending', label: 'Pendientes' },
  { value: 'copy_generated', label: 'Copy Generado' },
  { value: 'ready', label: 'Listos' },
  { value: 'active', label: 'Activos' },
  { value: 'needs_update', label: 'Actualizar' },
]

interface PackageRowData {
  copiesCount: number
  creativesCount: number
  uploadedCreativesCount: number
  campaignId: string
  adSetId: string
  campaignName: string | null
  adSetName: string | null
  adsActive: boolean
  togglingAds: boolean
}

export function MarketingTable({ packages: initialPackages }: MarketingTableProps) {
  const router = useRouter()
  const [packages, setPackages] = useState<Package[]>(initialPackages)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [isGeneratingAll, setIsGeneratingAll] = useState(false)
  const [expandedPackageId, setExpandedPackageId] = useState<number | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [creativeRequestPkg, setCreativeRequestPkg] = useState<Package | null>(null)

  // Column widths state
  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS)

  // Load column widths from localStorage on mount
  useEffect(() => {
    setColumnWidths(loadColumnWidths())
  }, [])

  const handleColumnResize = useCallback((key: ColumnKey, delta: number) => {
    setColumnWidths(prev => ({
      ...prev,
      [key]: Math.max(MIN_COLUMN_WIDTH, prev[key] + delta)
    }))
  }, [])

  const handleResizeEnd = useCallback(() => {
    saveColumnWidths(columnWidths)
  }, [columnWidths])

  // Store per-package data (IDs, counts)
  const [packageData, setPackageData] = useState<Record<number, PackageRowData>>({})
  const [loadingPackages, setLoadingPackages] = useState<Set<number>>(new Set())
  const [updatingExpiration, setUpdatingExpiration] = useState<Set<number>>(new Set())

  // Helper to reload package data
  const reloadPackageData = useCallback(async (packageId: number) => {
    const supabase = createClient()
    try {
      // Load copies count
      const { count: copiesCount } = await supabase
        .from('meta_ad_copies')
        .select('*', { count: 'exact', head: true })
        .eq('package_id', packageId)

      // Load creatives count
      const { data: creatives } = await supabase
        .from('meta_creatives')
        .select('upload_status')
        .eq('package_id', packageId)

      const creativesCount = creatives?.length || 0
      const uploadedCreativesCount = creatives?.filter((c: { upload_status: string }) => c.upload_status === 'uploaded').length || 0

      // Load ads status
      const { data: ads } = await supabase
        .from('meta_ads')
        .select('status')
        .eq('package_id', packageId)

      const hasActiveAds = ads?.some((ad: { status: string }) => ad.status === 'ACTIVE') || false

      setPackageData(prev => {
        const existing = prev[packageId] || {
          campaignId: '',
          adSetId: '',
          campaignName: null,
          adSetName: null,
        }
        return {
          ...prev,
          [packageId]: {
            ...existing,
            copiesCount: copiesCount || 0,
            creativesCount,
            uploadedCreativesCount,
            adsActive: hasActiveAds,
            togglingAds: false,
          }
        }
      })
    } catch (error) {
      console.error(`Error reloading data for package ${packageId}:`, error)
    }
  }, [])

  // Real-time subscriptions
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel('marketing-realtime')
      // Listen to packages changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
          filter: 'send_to_marketing=eq.true',
        },
        (payload) => {
          if (payload.eventType === 'UPDATE') {
            setPackages((prev) =>
              prev.map((p) =>
                p.id === payload.new.id ? { ...p, ...payload.new } : p
              )
            )
          }
        }
      )
      // Listen to creatives changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meta_creatives',
        },
        (payload) => {
          const packageId = (payload.new as { package_id?: number })?.package_id ||
                           (payload.old as { package_id?: number })?.package_id
          if (packageId) {
            reloadPackageData(packageId)
          }
        }
      )
      // Listen to copies changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meta_ad_copies',
        },
        (payload) => {
          const packageId = (payload.new as { package_id?: number })?.package_id ||
                           (payload.old as { package_id?: number })?.package_id
          if (packageId) {
            reloadPackageData(packageId)
          }
        }
      )
      // Listen to ads changes
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'meta_ads',
        },
        (payload) => {
          const packageId = (payload.new as { package_id?: number })?.package_id ||
                           (payload.old as { package_id?: number })?.package_id
          if (packageId) {
            reloadPackageData(packageId)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [reloadPackageData])

  // Load copies and creatives count for all packages - BATCHED for performance
  useEffect(() => {
    const loadPackageDataBatched = async () => {
      const supabase = createClient()
      const packageIds = packages.map(p => p.id)

      // Skip if no packages or already loaded
      if (packageIds.length === 0) return
      const unloadedIds = packageIds.filter(id => !packageData[id])
      if (unloadedIds.length === 0) return

      // Mark all as loading
      setLoadingPackages(new Set(unloadedIds))

      try {
        // Batch query 1: Get all copies counts
        const { data: allCopies } = await supabase
          .from('meta_ad_copies')
          .select('package_id')
          .in('package_id', unloadedIds)

        // Batch query 2: Get all creatives with upload status
        const { data: allCreatives } = await supabase
          .from('meta_creatives')
          .select('package_id, upload_status')
          .in('package_id', unloadedIds)

        // Batch query 3: Get all ads with status and adset info
        const { data: allAds } = await supabase
          .from('meta_ads')
          .select('package_id, status, meta_adset_id')
          .in('package_id', unloadedIds)

        // Process results into counts per package
        const copiesByPackage: Record<number, number> = {}
        ;(allCopies as Array<{ package_id: number }> | null)?.forEach(c => {
          copiesByPackage[c.package_id] = (copiesByPackage[c.package_id] || 0) + 1
        })

        const creativesByPackage: Record<number, { total: number; uploaded: number }> = {}
        ;(allCreatives as Array<{ package_id: number; upload_status: string }> | null)?.forEach(c => {
          if (!creativesByPackage[c.package_id]) {
            creativesByPackage[c.package_id] = { total: 0, uploaded: 0 }
          }
          creativesByPackage[c.package_id].total++
          if (c.upload_status === 'uploaded') {
            creativesByPackage[c.package_id].uploaded++
          }
        })

        const adsByPackage: Record<number, { hasActive: boolean; adSetId: string }> = {}
        ;(allAds as Array<{ package_id: number; status: string; meta_adset_id?: string }> | null)?.forEach(ad => {
          if (!adsByPackage[ad.package_id]) {
            adsByPackage[ad.package_id] = { hasActive: false, adSetId: '' }
          }
          if (ad.status === 'ACTIVE') {
            adsByPackage[ad.package_id].hasActive = true
          }
          if (ad.meta_adset_id && !adsByPackage[ad.package_id].adSetId) {
            adsByPackage[ad.package_id].adSetId = ad.meta_adset_id
          }
        })

        // Update state with all package data at once
        const newPackageData: Record<number, PackageRowData> = {}
        for (const pkgId of unloadedIds) {
          const creatives = creativesByPackage[pkgId] || { total: 0, uploaded: 0 }
          const ads = adsByPackage[pkgId] || { hasActive: false, adSetId: '' }

          newPackageData[pkgId] = {
            copiesCount: copiesByPackage[pkgId] || 0,
            creativesCount: creatives.total,
            uploadedCreativesCount: creatives.uploaded,
            campaignId: '', // Don't lookup on initial load - defer to user interaction
            adSetId: ads.adSetId,
            campaignName: null,
            adSetName: null, // Don't lookup on initial load - defer to user interaction
            adsActive: ads.hasActive,
            togglingAds: false,
          }
        }

        setPackageData(prev => ({ ...prev, ...newPackageData }))
      } catch (error) {
        console.error('Error loading batched package data:', error)
      } finally {
        setLoadingPackages(new Set())
      }
    }

    loadPackageDataBatched()
  }, [packages])

  // Lookup campaign/adset names
  const lookupMeta = async (packageId: number, type: 'campaign' | 'adset', id: string) => {
    if (!id.trim()) {
      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          [type === 'campaign' ? 'campaignName' : 'adSetName']: null
        }
      }))
      return
    }

    try {
      const res = await fetch(`/api/meta/lookup?type=${type}&id=${id.trim()}`)
      const data = await res.json()
      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          [type === 'campaign' ? 'campaignName' : 'adSetName']: data.found ? data.name : null
        }
      }))
    } catch {
      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          [type === 'campaign' ? 'campaignName' : 'adSetName']: null
        }
      }))
    }
  }

  const updatePackageField = (packageId: number, field: keyof PackageRowData, value: string) => {
    setPackageData(prev => ({
      ...prev,
      [packageId]: {
        ...prev[packageId],
        [field]: value
      }
    }))

    // Debounce lookup
    if (field === 'campaignId' || field === 'adSetId') {
      const type = field === 'campaignId' ? 'campaign' : 'adset'
      setTimeout(() => lookupMeta(packageId, type, value), 500)
    }
  }

  // Lazy lookup - only fetch Meta names when user focuses the field (if not already loaded)
  const handleFieldFocus = (packageId: number, field: 'campaignId' | 'adSetId') => {
    const data = packageData[packageId]
    if (!data) return

    const type = field === 'campaignId' ? 'campaign' : 'adset'
    const nameField = field === 'campaignId' ? 'campaignName' : 'adSetName'
    const idValue = data[field]

    // Only lookup if we have an ID but no name yet
    if (idValue && !data[nameField]) {
      lookupMeta(packageId, type, idValue)
    }
  }

  const filteredPackages = packages.filter((pkg) => {
    // Handle needs_update filter separately
    if (statusFilter === 'needs_update') {
      if (!pkg.creative_update_needed) return false
    } else if (statusFilter !== 'all' && pkg.marketing_status !== statusFilter) {
      return false
    }
    if (searchQuery) {
      const query = normalizeText(searchQuery)
      return (
        normalizeText(pkg.title).includes(query) ||
        pkg.tc_package_id.toString().includes(searchQuery)
      )
    }
    return true
  })

  const pendingPackages = filteredPackages.filter(p => p.marketing_status === 'pending')

  const handleGenerateAllCopies = async () => {
    if (pendingPackages.length === 0) {
      toast.error('No hay paquetes pendientes')
      return
    }

    setIsGeneratingAll(true)
    try {
      const response = await fetch('/api/meta/copy/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageIds: pendingPackages.map(p => p.id) }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error generando copies')
      }

      toast.success(`Copies generados para ${data.summary?.success || 0} paquetes`)
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error generando copies')
    } finally {
      setIsGeneratingAll(false)
    }
  }

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      router.refresh()
      // Wait a bit for the refresh to complete, then reload package data
      await new Promise(resolve => setTimeout(resolve, 500))
      // Reload data for all packages
      for (const pkg of packages) {
        await reloadPackageData(pkg.id)
      }
    } finally {
      setIsRefreshing(false)
    }
  }

  const formatShortDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: 'short' })
  }

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: currency || 'USD',
      maximumFractionDigits: 0,
    }).format(price)
  }

  // Check if a date is expired (past today)
  const isExpired = (dateStr: string | null) => {
    if (!dateStr) return false
    const date = new Date(dateStr)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date < today
  }

  // Update expiration date
  const handleUpdateExpiration = async (packageId: number, date: Date | undefined) => {
    setUpdatingExpiration(prev => new Set(prev).add(packageId))
    try {
      const dateStr = date ? format(date, 'yyyy-MM-dd') : null
      const res = await fetch('/api/meta/package', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId, marketing_expiration_date: dateStr }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error actualizando fecha')
      }

      // Update local state
      setPackages(prev =>
        prev.map(p =>
          p.id === packageId ? { ...p, marketing_expiration_date: dateStr } : p
        )
      )
      toast.success(date ? 'Fecha de vencimiento actualizada' : 'Fecha de vencimiento eliminada')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error actualizando fecha')
    } finally {
      setUpdatingExpiration(prev => {
        const newSet = new Set(prev)
        newSet.delete(packageId)
        return newSet
      })
    }
  }

  // Toggle ads status
  const handleToggleAds = async (packageId: number, currentActive: boolean) => {
    const newStatus = currentActive ? 'PAUSED' : 'ACTIVE'

    setPackageData(prev => ({
      ...prev,
      [packageId]: {
        ...prev[packageId],
        togglingAds: true,
      }
    }))

    try {
      const res = await fetch('/api/meta/ads/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId, status: newStatus }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error actualizando estado')
      }

      // Update local state
      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          adsActive: newStatus === 'ACTIVE',
          togglingAds: false,
        }
      }))

      toast.success(`Anuncios ${newStatus === 'ACTIVE' ? 'activados' : 'pausados'} (${data.updated}/${data.total})`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error actualizando estado')
      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          togglingAds: false,
        }
      }))
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar paquete..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-[200px]"
            />
          </div>

          <Select
            value={statusFilter}
            onValueChange={(v) => setStatusFilter(v as StatusFilter)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Badge variant="outline" className="py-1.5">
            {filteredPackages.length} paquete{filteredPackages.length !== 1 ? 's' : ''}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          {pendingPackages.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateAllCopies}
              disabled={isGeneratingAll}
            >
              {isGeneratingAll ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Wand2 className="h-4 w-4 mr-2" />
              )}
              Generar Copy ({pendingPackages.length})
            </Button>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            disabled={isRefreshing}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Table */}
      {filteredPackages.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p>No hay paquetes en marketing</p>
          {searchQuery && (
            <p className="text-sm mt-1">Prueba con otra búsqueda</p>
          )}
        </div>
      ) : (
        <Table className="table-fixed">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <ResizableHeader label="ID" columnKey="id" width={columnWidths.id} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Paquete" columnKey="paquete" width={columnWidths.paquete} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              <ResizableHeader label="Rango" columnKey="rango" width={columnWidths.rango} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Vencimiento" columnKey="vencimiento" width={columnWidths.vencimiento} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Campaign ID" columnKey="campaignId" width={columnWidths.campaignId} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="AdSet ID" columnKey="adsetId" width={columnWidths.adsetId} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Copies" columnKey="copies" width={columnWidths.copies} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Creativos" columnKey="creativos" width={columnWidths.creativos} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="Ads" columnKey="ads" width={columnWidths.ads} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="On/Off" columnKey="status" width={columnWidths.status} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="" columnKey="actions" width={columnWidths.actions} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPackages.map((pkg) => {
              const data = packageData[pkg.id] || {
                copiesCount: 0,
                creativesCount: 0,
                uploadedCreativesCount: 0,
                campaignId: '',
                adSetId: '',
                campaignName: null,
                adSetName: null,
                adsActive: false,
                togglingAds: false,
              }
              const isLoading = loadingPackages.has(pkg.id)
              const isExpanded = expandedPackageId === pkg.id
              const expirationExpired = isExpired(pkg.marketing_expiration_date)

              return (
                <Fragment key={pkg.id}>
                  <TableRow
                    className={`hover:bg-muted/30 ${isExpanded ? 'bg-muted/20' : ''}`}
                  >
                    {/* TC Package ID */}
                    <TableCell style={{ width: columnWidths.id, minWidth: columnWidths.id, maxWidth: columnWidths.id }}>
                      <Badge variant="outline" className="font-mono">
                        {pkg.tc_package_id}
                      </Badge>
                    </TableCell>

                    {/* Title + Price + Nights */}
                    <TableCell style={{ width: columnWidths.paquete, minWidth: columnWidths.paquete, maxWidth: columnWidths.paquete }}>
                      <div className="flex flex-col overflow-hidden">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm truncate" title={pkg.title}>
                            {pkg.title}
                          </span>
                          {pkg.creative_update_needed && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                setCreativeRequestPkg(pkg)
                              }}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 shrink-0 hover:bg-amber-200 transition-colors cursor-pointer"
                              title="Click para solicitar nuevos creativos"
                            >
                              <AlertTriangle className="h-3 w-3 mr-0.5" />
                              Solicitar
                            </button>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatPrice(pkg.current_price_per_pax, pkg.currency)} · {pkg.nights_count}N
                          {pkg.creative_update_needed && pkg.price_at_creative_creation && (
                            <span className="text-amber-600 ml-1">
                              (era {formatPrice(pkg.price_at_creative_creation, pkg.currency)})
                            </span>
                          )}
                        </span>
                      </div>
                    </TableCell>

                    {/* Date Range */}
                    <TableCell className="text-center text-xs" style={{ width: columnWidths.rango, minWidth: columnWidths.rango, maxWidth: columnWidths.rango }}>
                      {pkg.date_range_start && pkg.date_range_end ? (
                        <span>
                          {formatShortDate(pkg.date_range_start)} → {formatShortDate(pkg.date_range_end)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>

                    {/* Vencimiento */}
                    <TableCell className="text-center" style={{ width: columnWidths.vencimiento, minWidth: columnWidths.vencimiento, maxWidth: columnWidths.vencimiento }}>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={`h-8 px-2 text-xs font-normal ${
                              expirationExpired
                                ? 'text-red-600 bg-red-50 hover:bg-red-100 hover:text-red-700'
                                : pkg.marketing_expiration_date
                                ? 'text-green-600'
                                : 'text-muted-foreground'
                            }`}
                            disabled={updatingExpiration.has(pkg.id)}
                          >
                            {updatingExpiration.has(pkg.id) ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : pkg.marketing_expiration_date ? (
                              <>
                                <Calendar className="h-3 w-3 mr-1" />
                                {format(new Date(pkg.marketing_expiration_date), 'dd MMM', { locale: es })}
                              </>
                            ) : (
                              <>
                                <Calendar className="h-3 w-3 mr-1" />
                                -
                              </>
                            )}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="center">
                          <CalendarComponent
                            mode="single"
                            selected={pkg.marketing_expiration_date ? new Date(pkg.marketing_expiration_date) : undefined}
                            onSelect={(date) => handleUpdateExpiration(pkg.id, date)}
                            initialFocus
                            locale={es}
                          />
                          {pkg.marketing_expiration_date && (
                            <div className="p-2 border-t">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleUpdateExpiration(pkg.id, undefined)}
                              >
                                Quitar fecha
                              </Button>
                            </div>
                          )}
                        </PopoverContent>
                      </Popover>
                    </TableCell>

                    {/* Campaign ID */}
                    <TableCell style={{ width: columnWidths.campaignId, minWidth: columnWidths.campaignId, maxWidth: columnWidths.campaignId }}>
                      <div className="flex flex-col items-center">
                        <Input
                          placeholder="Campaign ID"
                          value={data.campaignId ?? ''}
                          onChange={(e) => updatePackageField(pkg.id, 'campaignId', e.target.value)}
                          onFocus={() => handleFieldFocus(pkg.id, 'campaignId')}
                          className={`w-full h-9 text-xs text-center font-mono ${
                            data.campaignName ? 'border-green-500' :
                            data.campaignId ? 'border-red-400' : ''
                          }`}
                        />
                        {data.campaignName && (
                          <span className="text-[10px] text-green-600 truncate w-full text-center mt-0.5">
                            {data.campaignName}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* AdSet ID */}
                    <TableCell style={{ width: columnWidths.adsetId, minWidth: columnWidths.adsetId, maxWidth: columnWidths.adsetId }}>
                      <div className="flex flex-col items-center">
                        <Input
                          placeholder="AdSet ID *"
                          value={data.adSetId ?? ''}
                          onChange={(e) => updatePackageField(pkg.id, 'adSetId', e.target.value)}
                          onFocus={() => handleFieldFocus(pkg.id, 'adSetId')}
                          className={`w-full h-9 text-xs text-center font-mono ${
                            data.adSetName ? 'border-green-500' :
                            data.adSetId ? 'border-red-400' : ''
                          }`}
                        />
                        {data.adSetName && (
                          <span className="text-[10px] text-green-600 truncate w-full text-center mt-0.5">
                            {data.adSetName}
                          </span>
                        )}
                      </div>
                    </TableCell>

                    {/* Copies Count */}
                    <TableCell className="text-center" style={{ width: columnWidths.copies, minWidth: columnWidths.copies, maxWidth: columnWidths.copies }}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        <Badge
                          variant={data.copiesCount >= 5 ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {data.copiesCount >= 5 && <Check className="h-3 w-3 mr-1" />}
                          {data.copiesCount}/5
                        </Badge>
                      )}
                    </TableCell>

                    {/* Creatives Count */}
                    <TableCell className="text-center" style={{ width: columnWidths.creativos, minWidth: columnWidths.creativos, maxWidth: columnWidths.creativos }}>
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mx-auto" />
                      ) : (
                        <div className="flex items-center justify-center gap-1">
                          <Badge
                            variant={data.uploadedCreativesCount > 0 ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {data.uploadedCreativesCount > 0 ? (
                              <Check className="h-3 w-3 mr-1" />
                            ) : data.creativesCount > 0 ? (
                              <Upload className="h-3 w-3 mr-1" />
                            ) : (
                              <ImageIcon className="h-3 w-3 mr-1" />
                            )}
                            {data.uploadedCreativesCount}/{data.creativesCount}
                          </Badge>
                        </div>
                      )}
                    </TableCell>

                    {/* Ads Count */}
                    <TableCell className="text-center" style={{ width: columnWidths.ads, minWidth: columnWidths.ads, maxWidth: columnWidths.ads }}>
                      {pkg.ads_created_count > 0 ? (
                        <Badge variant="default" className="text-xs bg-green-600">
                          {pkg.ads_created_count}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-muted-foreground">
                          0
                        </Badge>
                      )}
                    </TableCell>

                    {/* Ads On/Off Toggle */}
                    <TableCell className="text-center" style={{ width: columnWidths.status, minWidth: columnWidths.status, maxWidth: columnWidths.status }}>
                      {pkg.ads_created_count > 0 ? (
                        <div className="flex items-center justify-center">
                          {data.togglingAds ? (
                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                          ) : (
                            <button
                              onClick={() => handleToggleAds(pkg.id, data.adsActive)}
                              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                data.adsActive
                                  ? 'bg-green-500 focus:ring-green-500'
                                  : 'bg-gray-300 focus:ring-gray-400'
                              }`}
                              title={data.adsActive ? 'Click para pausar' : 'Click para activar'}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-lg transition-transform ${
                                  data.adsActive ? 'translate-x-6' : 'translate-x-1'
                                }`}
                              />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-xs">-</span>
                      )}
                    </TableCell>

                    {/* Expand Button */}
                    <TableCell style={{ width: columnWidths.actions, minWidth: columnWidths.actions, maxWidth: columnWidths.actions }}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedPackageId(isExpanded ? null : pkg.id)}
                        className="h-8 w-8 p-0"
                      >
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <TableRow key={`${pkg.id}-expanded`}>
                      <TableCell colSpan={11} className="bg-muted/10 p-0">
                        <PackageRowExpanded
                          pkg={pkg}
                          campaignId={data.campaignId}
                          adSetId={data.adSetId}
                          onUpdate={() => {
                            handleRefresh()
                          }}
                          onDataUpdate={(updates) => {
                            setPackageData(prev => ({
                              ...prev,
                              [pkg.id]: {
                                ...prev[pkg.id],
                                ...updates
                              }
                            }))
                          }}
                          onRequestCreative={() => setCreativeRequestPkg(pkg)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              )
            })}
          </TableBody>
        </Table>
      )}

      {/* Creative Request Modal */}
      {creativeRequestPkg && (
        <CreativeRequestModal
          open={!!creativeRequestPkg}
          onClose={() => setCreativeRequestPkg(null)}
          pkg={creativeRequestPkg}
          onSuccess={() => {
            // Clear the creative_update_needed flag locally
            setPackages(prev =>
              prev.map(p =>
                p.id === creativeRequestPkg.id
                  ? { ...p, creative_update_needed: false }
                  : p
              )
            )
          }}
        />
      )}
    </div>
  )
}
