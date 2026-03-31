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
  MoreVertical,
  Trash2,
  CirclePause,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Link2,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import { PackageRowExpanded } from './PackageRowExpanded'
import { CreativeRequestModal } from './CreativeRequestModal'
import { ImportAdsModal } from './ImportAdsModal'

function buildPackageUrl(packageId: number, title: string): string {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `https://www.siviajo.com/es/idea/${packageId}/${slug}`
}

// Normalize string by removing accents/diacritics
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

// Column configuration for resizable columns
type ColumnKey = 'id' | 'paquete' | 'creado' | 'rango' | 'vencimiento' | 'adAccountId' | 'campaignId' | 'adsetId' | 'copies' | 'creativos' | 'ads' | 'status' | 'actions'

const DEFAULT_COLUMN_WIDTHS: Record<ColumnKey, number> = {
  id: 90,
  paquete: 200,
  creado: 90,
  rango: 120,
  vencimiento: 110,
  adAccountId: 160,
  campaignId: 200,
  adsetId: 200,
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

type SortDirection = 'asc' | 'desc' | null

interface ResizableHeaderProps {
  label: string
  columnKey: ColumnKey
  width: number
  onResize: (key: ColumnKey, delta: number) => void
  onResizeEnd: () => void
  centered?: boolean
  sortable?: boolean
  sortDirection?: SortDirection
  onSort?: (key: ColumnKey) => void
}

function ResizableHeader({
  label,
  columnKey,
  width,
  onResize,
  onResizeEnd,
  centered = false,
  sortable = false,
  sortDirection = null,
  onSort,
}: ResizableHeaderProps) {
  return (
    <TableHead
      className="relative group"
      style={{ width: `${width}px`, minWidth: `${width}px`, maxWidth: `${width}px` }}
    >
      <div
        className={`flex items-center gap-1 text-xs pr-2 ${centered ? 'justify-center' : ''} ${sortable ? 'cursor-pointer select-none hover:text-foreground' : ''}`}
        onClick={sortable && onSort ? () => onSort(columnKey) : undefined}
      >
        {label}
        {sortable && (
          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> :
          sortDirection === 'desc' ? <ArrowDown className="h-3 w-3" /> :
          <ArrowUpDown className="h-3 w-3 opacity-30" />
        )}
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
  original_price_per_pax?: number | null
  created_at?: string | null
  meta_campaign_id?: string | null
  meta_adset_ids?: string | null
  meta_ad_account_id?: string | null
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
  adAccountId: string
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
  const [isSyncingMeta, setIsSyncingMeta] = useState(false)
  const [creativeRequestPkg, setCreativeRequestPkg] = useState<Package | null>(null)
  const [removingAds, setRemovingAds] = useState<Set<number>>(new Set())
  const [confirmRemovePackageId, setConfirmRemovePackageId] = useState<number | null>(null)
  const [confirmRemoveFromMarketing, setConfirmRemoveFromMarketing] = useState<number | null>(null)
  const [removingFromMarketing, setRemovingFromMarketing] = useState<Set<number>>(new Set())
  const [importAdsPkg, setImportAdsPkg] = useState<Package | null>(null)
  const [sortColumn, setSortColumn] = useState<ColumnKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDirection>(null)
  const [campaignFilter, setCampaignFilter] = useState<string>('all')
  const [adsetFilter, setAdsetFilter] = useState<string>('all')
  const [pendingRequests, setPendingRequests] = useState<Record<number, number>>({}) // package_id -> request_id
  const [cancellingRequest, setCancellingRequest] = useState<Set<number>>(new Set())
  const [dismissingUpdate, setDismissingUpdate] = useState<Set<number>>(new Set())

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
          // Use saved IDs from package, fallback to ads table
          const pkgObj = packages.find(p => p.id === pkgId)
          const savedAdSetId = pkgObj?.meta_adset_ids || ''
          const savedCampaignId = pkgObj?.meta_campaign_id || ''
          const savedAdAccountId = pkgObj?.meta_ad_account_id || ''

          newPackageData[pkgId] = {
            copiesCount: copiesByPackage[pkgId] || 0,
            creativesCount: creatives.total,
            uploadedCreativesCount: creatives.uploaded,
            adAccountId: savedAdAccountId,
            campaignId: savedCampaignId || '',
            adSetId: savedAdSetId || ads.adSetId,
            campaignName: null,
            adSetName: null,
            adsActive: ads.hasActive,
            togglingAds: false,
          }
        }

        setPackageData(prev => ({ ...prev, ...newPackageData }))

        // Batch lookup: collect all unique adset IDs, then resolve names in ONE call
        const adsetIdMap: Record<string, { pkgIds: number[]; rawId: string }> = {}
        const campaignIdSet = new Set<string>()

        for (const pkgId of unloadedIds) {
          const adSetIdRaw = newPackageData[pkgId]?.adSetId
          if (adSetIdRaw) {
            const firstAdSetId = adSetIdRaw.split(',')[0].trim()
            if (!firstAdSetId) continue
            if (!adsetIdMap[firstAdSetId]) {
              adsetIdMap[firstAdSetId] = { pkgIds: [], rawId: adSetIdRaw }
            }
            adsetIdMap[firstAdSetId].pkgIds.push(pkgId)
          }
          const campId = newPackageData[pkgId]?.campaignId
          if (campId) campaignIdSet.add(campId)
        }

        const uniqueAdsetIds = Object.keys(adsetIdMap)
        if (uniqueAdsetIds.length > 0 || campaignIdSet.size > 0) {
          try {
            const batchRes = await fetch('/api/meta/lookup/batch', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                adsetIds: uniqueAdsetIds,
                campaignIds: Array.from(campaignIdSet),
              }),
            })
            const batchData = await batchRes.json()
            const { campaigns: campMap, adsets: adsetMap, needsSync } = batchData

            // Also collect campaign IDs from adset results for a second resolve pass
            const extraCampaignIds = new Set<string>()
            for (const adsetId of uniqueAdsetIds) {
              const adsetInfo = adsetMap[adsetId]
              if (adsetInfo?.campaign_id && !campMap[adsetInfo.campaign_id]) {
                extraCampaignIds.add(adsetInfo.campaign_id)
              }
            }

            // If there are campaign IDs we got from adsets that weren't in the first batch, fetch them
            if (extraCampaignIds.size > 0) {
              const extraRes = await fetch('/api/meta/lookup/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignIds: Array.from(extraCampaignIds), adsetIds: [] }),
              })
              const extraData = await extraRes.json()
              Object.assign(campMap, extraData.campaigns || {})
            }

            // Apply results to package data
            setPackageData(prev => {
              const updated = { ...prev }
              for (const [adsetId, { pkgIds, rawId }] of Object.entries(adsetIdMap)) {
                const adsetInfo = adsetMap[adsetId]
                if (!adsetInfo) continue

                const adSetIds = rawId.split(',').map((s: string) => s.trim()).filter(Boolean)
                const adSetLabel = adSetIds.length > 1
                  ? `${adsetInfo.name} (+${adSetIds.length - 1})`
                  : adsetInfo.name

                for (const pkgId of pkgIds) {
                  const campId = adsetInfo.campaign_id || updated[pkgId]?.campaignId
                  const campInfo = campId ? campMap[campId] : null
                  updated[pkgId] = {
                    ...updated[pkgId],
                    adSetName: adSetLabel,
                    campaignId: updated[pkgId]?.campaignId || adsetInfo.campaign_id || '',
                    campaignName: campInfo?.name || updated[pkgId]?.campaignName || null,
                  }
                }
              }

              // Also apply campaign names for packages that had campaignId but no adset
              for (const pkgId of unloadedIds) {
                const campId = updated[pkgId]?.campaignId
                if (campId && campMap[campId] && !updated[pkgId]?.campaignName) {
                  updated[pkgId] = {
                    ...updated[pkgId],
                    campaignName: campMap[campId].name,
                  }
                }
              }

              return updated
            })

            // If data is stale (>24h), trigger background sync
            if (needsSync) {
              console.log('[Marketing] Meta data stale, triggering background sync...')
              fetch('/api/meta/campaigns').catch(() => {})
            }
          } catch (err) {
            console.error('[Batch Lookup] Error:', err)
          }
        }
      } catch (error) {
        console.error('Error loading batched package data:', error)
      } finally {
        setLoadingPackages(new Set())
      }
    }

    loadPackageDataBatched()
  }, [packages])

  // Load pending creative requests for all packages
  useEffect(() => {
    const loadPendingRequests = async () => {
      try {
        const res = await fetch('/api/creative-requests?status=pending')
        if (!res.ok) return
        const requests = await res.json()
        const map: Record<number, number> = {}
        for (const req of requests) {
          // Keep the most recent request per package
          if (!map[req.package_id]) {
            map[req.package_id] = req.id
          }
        }
        setPendingRequests(map)
      } catch {
        // ignore
      }
    }
    loadPendingRequests()
  }, [])

  // Cancel a creative request
  const handleCancelCreativeRequest = async (packageId: number) => {
    const requestId = pendingRequests[packageId]
    if (!requestId) return

    setCancellingRequest(prev => new Set(prev).add(packageId))
    try {
      const res = await fetch(`/api/creative-requests?id=${requestId}&action=discard`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Error al cancelar')

      // Remove from pending requests
      setPendingRequests(prev => {
        const next = { ...prev }
        delete next[packageId]
        return next
      })

      // Restore creative_update_needed so they can re-request
      setPackages(prev =>
        prev.map(p =>
          p.id === packageId ? { ...p, creative_update_needed: true } : p
        )
      )

      toast.success('Solicitud de diseño cancelada')
    } catch {
      toast.error('Error al cancelar la solicitud')
    } finally {
      setCancellingRequest(prev => {
        const next = new Set(prev)
        next.delete(packageId)
        return next
      })
    }
  }

  const handleDismissUpdate = async (packageId: number) => {
    setDismissingUpdate(prev => new Set(prev).add(packageId))
    try {
      const res = await fetch(`/api/packages/${packageId}/dismiss-update`, { method: 'POST' })
      if (!res.ok) throw new Error('Error al descartar')

      setPackages(prev =>
        prev.map(p =>
          p.id === packageId ? { ...p, creative_update_needed: false, creative_update_reason: null } : p
        )
      )
      toast.success('Solicitud descartada')
    } catch {
      toast.error('Error al descartar la solicitud')
    } finally {
      setDismissingUpdate(prev => {
        const next = new Set(prev)
        next.delete(packageId)
        return next
      })
    }
  }

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
      // For adsets, support comma-separated IDs - lookup the first one
      const lookupId = type === 'adset' ? id.split(',')[0].trim() : id.trim()
      if (!lookupId) return

      const res = await fetch(`/api/meta/lookup?type=${type}&id=${lookupId}`)
      const data = await res.json()

      let displayName = data.found ? data.name : null
      if (type === 'adset' && data.found) {
        const adSetIds = id.split(',').map((s: string) => s.trim()).filter(Boolean)
        if (adSetIds.length > 1) {
          displayName = `${data.name} (+${adSetIds.length - 1})`
        }
      }

      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          [type === 'campaign' ? 'campaignName' : 'adSetName']: displayName
        }
      }))

      // If we looked up an adset and found it, auto-fill the campaign
      if (type === 'adset' && data.found && data.campaign_id) {
        setPackageData(prev => ({
          ...prev,
          [packageId]: {
            ...prev[packageId],
            campaignId: data.campaign_id,
          }
        }))
        // Now lookup campaign name
        lookupMeta(packageId, 'campaign', data.campaign_id)
      }
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

  const saveTimersRef = useRef<Record<string, NodeJS.Timeout>>({})

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

    // Auto-save to package with debounce
    if (field === 'adAccountId' || field === 'campaignId' || field === 'adSetId') {
      const timerKey = `${packageId}-${field}`
      if (saveTimersRef.current[timerKey]) clearTimeout(saveTimersRef.current[timerKey])
      saveTimersRef.current[timerKey] = setTimeout(() => {
        const dbFieldMap: Record<string, string> = {
          adAccountId: 'meta_ad_account_id',
          campaignId: 'meta_campaign_id',
          adSetId: 'meta_adset_ids',
        }
        const dbField = dbFieldMap[field]
        fetch(`/api/packages/${packageId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [dbField]: value.trim() || null }),
        }).catch(() => { /* silent save */ })
      }, 1000)
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

  const handleSort = useCallback((key: ColumnKey) => {
    if (sortColumn === key) {
      // Cycle: asc → desc → none
      if (sortDir === 'asc') setSortDir('desc')
      else if (sortDir === 'desc') { setSortColumn(null); setSortDir(null) }
      else setSortDir('asc')
    } else {
      setSortColumn(key)
      setSortDir('asc')
    }
  }, [sortColumn, sortDir])

  // Build unique campaign/adset options for filters
  const campaignOptions = (() => {
    const map = new Map<string, string>() // id -> name
    for (const pkg of packages) {
      const data = packageData[pkg.id]
      if (data?.campaignId) {
        map.set(data.campaignId, data.campaignName || data.campaignId)
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })()

  const adsetOptions = (() => {
    const map = new Map<string, string>() // id -> name
    for (const pkg of packages) {
      const data = packageData[pkg.id]
      if (data?.adSetId) {
        const firstId = data.adSetId.split(',')[0].trim()
        if (firstId) {
          map.set(firstId, data.adSetName || firstId)
        }
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ value: id, label: name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  })()

  const filteredPackages = packages.filter((pkg) => {
    // Handle needs_update filter separately
    if (statusFilter === 'needs_update') {
      if (!pkg.creative_update_needed) return false
    } else if (statusFilter !== 'all' && pkg.marketing_status !== statusFilter) {
      return false
    }
    if (searchQuery) {
      const query = normalizeText(searchQuery)
      if (!normalizeText(pkg.title).includes(query) && !pkg.tc_package_id.toString().includes(searchQuery)) {
        return false
      }
    }
    // Campaign filter
    if (campaignFilter !== 'all') {
      const data = packageData[pkg.id]
      if (!data?.campaignId || data.campaignId !== campaignFilter) return false
    }
    // AdSet filter
    if (adsetFilter !== 'all') {
      const data = packageData[pkg.id]
      if (!data?.adSetId) return false
      const adsetIds = data.adSetId.split(',').map((s: string) => s.trim())
      if (!adsetIds.includes(adsetFilter)) return false
    }
    return true
  })

  // Sort filtered packages
  const sortedPackages = [...filteredPackages].sort((a, b) => {
    if (!sortColumn || !sortDir) return 0
    const dir = sortDir === 'asc' ? 1 : -1

    const getValue = (pkg: Package): string | number => {
      switch (sortColumn) {
        case 'id': return pkg.tc_package_id
        case 'paquete': return pkg.title.toLowerCase()
        case 'creado': return pkg.created_at || ''
        case 'rango': return pkg.date_range_start || ''
        case 'vencimiento': return pkg.marketing_expiration_date || ''
        case 'copies': return packageData[pkg.id]?.copiesCount || 0
        case 'creativos': return packageData[pkg.id]?.uploadedCreativesCount || 0
        case 'ads': return pkg.ads_created_count
        default: return 0
      }
    }

    const va = getValue(a)
    const vb = getValue(b)
    if (va < vb) return -1 * dir
    if (va > vb) return 1 * dir
    return 0
  })

  const pendingPackages = sortedPackages.filter(p => p.marketing_status === 'pending')

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

  // Hard refresh: re-resolve all campaign/adset names
  const handleSyncMetaNames = async () => {
    setIsSyncingMeta(true)
    try {
      // Collect all unique campaign/adset IDs
      const campaignIdSet = new Set<string>()
      const adsetIdMap: Record<string, number[]> = {}

      for (const pkg of packages) {
        const data = packageData[pkg.id]
        if (!data) continue
        if (data.campaignId) campaignIdSet.add(data.campaignId)
        if (data.adSetId) {
          const firstId = data.adSetId.split(',')[0].trim()
          if (firstId) {
            if (!adsetIdMap[firstId]) adsetIdMap[firstId] = []
            adsetIdMap[firstId].push(pkg.id)
          }
        }
      }

      if (campaignIdSet.size === 0 && Object.keys(adsetIdMap).length === 0) {
        toast.info('No hay IDs para sincronizar')
        return
      }

      const res = await fetch('/api/meta/lookup/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignIds: Array.from(campaignIdSet),
          adsetIds: Object.keys(adsetIdMap),
        }),
      })
      const batchData = await res.json()
      const { campaigns: campMap, adsets: adsetMap } = batchData

      // Apply results
      setPackageData(prev => {
        const updated = { ...prev }
        for (const pkg of packages) {
          const data = updated[pkg.id]
          if (!data) continue

          // Update campaign name
          if (data.campaignId && campMap[data.campaignId]) {
            updated[pkg.id] = { ...updated[pkg.id], campaignName: campMap[data.campaignId].name }
          }

          // Update adset name
          if (data.adSetId) {
            const firstId = data.adSetId.split(',')[0].trim()
            if (firstId && adsetMap[firstId]) {
              const adSetIds = data.adSetId.split(',').map((s: string) => s.trim()).filter(Boolean)
              const adSetLabel = adSetIds.length > 1
                ? `${adsetMap[firstId].name} (+${adSetIds.length - 1})`
                : adsetMap[firstId].name
              updated[pkg.id] = {
                ...updated[pkg.id],
                adSetName: adSetLabel,
                campaignId: updated[pkg.id].campaignId || adsetMap[firstId].campaign_id || '',
              }
              // Also fill campaign name from adset's campaign
              const campId = adsetMap[firstId].campaign_id
              if (campId && campMap[campId] && !updated[pkg.id].campaignName) {
                updated[pkg.id] = { ...updated[pkg.id], campaignName: campMap[campId].name }
              }
            }
          }
        }
        return updated
      })

      toast.success(`Nombres actualizados: ${Object.keys(campMap).length} campaigns, ${Object.keys(adsetMap).length} adsets`)
    } catch (error) {
      toast.error('Error sincronizando nombres')
      console.error('[Sync Meta Names]', error)
    } finally {
      setIsSyncingMeta(false)
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

  // Remove all ads for a package (delete from Meta + DB)
  const handleRemoveAllAds = async (packageId: number) => {
    setRemovingAds(prev => new Set(prev).add(packageId))
    setConfirmRemovePackageId(null)

    try {
      const res = await fetch('/api/meta/ads', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package_id: packageId, delete_from_meta: true }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Error eliminando anuncios')
      }

      // Update local package state
      setPackages(prev =>
        prev.map(p =>
          p.id === packageId
            ? { ...p, ads_created_count: 0 }
            : p
        )
      )

      setPackageData(prev => ({
        ...prev,
        [packageId]: {
          ...prev[packageId],
          adsActive: false,
        }
      }))

      toast.success(`${data.deleted_count} anuncios eliminados de Meta`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error eliminando anuncios')
    } finally {
      setRemovingAds(prev => {
        const newSet = new Set(prev)
        newSet.delete(packageId)
        return newSet
      })
    }
  }

  // Remove package from marketing (back to imported, also removes ads if any)
  const handleRemoveFromMarketing = async (packageId: number) => {
    setRemovingFromMarketing(prev => new Set(prev).add(packageId))
    setConfirmRemoveFromMarketing(null)

    try {
      // If package has ads, delete them from Meta first
      const pkg = packages.find(p => p.id === packageId)
      if (pkg && pkg.ads_created_count > 0) {
        await fetch('/api/meta/ads', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ package_id: packageId, delete_from_meta: true }),
        })
      }

      // Update package status back to imported
      const res = await fetch(`/api/packages/${packageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'imported',
          send_to_marketing: false,
          marketing_completed: false,
          marketing_status: null,
          ads_created_count: 0,
          ads_active_count: 0,
          send_to_design: false,
          design_completed: false,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Error quitando de marketing')
      }

      // Remove from local state
      setPackages(prev => prev.filter(p => p.id !== packageId))
      toast.success('Paquete quitado de marketing')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error quitando de marketing')
    } finally {
      setRemovingFromMarketing(prev => {
        const newSet = new Set(prev)
        newSet.delete(packageId)
        return newSet
      })
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
            variant="outline"
            size="sm"
            onClick={handleSyncMetaNames}
            disabled={isSyncingMeta}
            type="button"
            title="Sincronizar nombres de campaigns y adsets"
          >
            {isSyncingMeta ? (
              <Loader2 className="h-4 w-4 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-1" />
            )}
            Sync Meta
          </Button>

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
      {sortedPackages.length === 0 ? (
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
              <ResizableHeader label="ID" columnKey="id" width={columnWidths.id} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} sortable sortDirection={sortColumn === 'id' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Paquete" columnKey="paquete" width={columnWidths.paquete} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} sortable sortDirection={sortColumn === 'paquete' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Creado" columnKey="creado" width={columnWidths.creado} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'creado' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Rango" columnKey="rango" width={columnWidths.rango} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'rango' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Vencimiento" columnKey="vencimiento" width={columnWidths.vencimiento} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'vencimiento' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Cuenta" columnKey="adAccountId" width={columnWidths.adAccountId} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <TableHead
                className="relative group"
                style={{ width: `${columnWidths.campaignId}px`, minWidth: `${columnWidths.campaignId}px`, maxWidth: `${columnWidths.campaignId}px` }}
              >
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="text-xs text-center">Campaign</span>
                  <select
                    value={campaignFilter}
                    onChange={(e) => setCampaignFilter(e.target.value)}
                    className="w-full h-5 text-[10px] bg-transparent border border-border rounded px-1 text-center truncate focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">Todas</option>
                    {campaignOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <ResizeHandle columnKey="campaignId" onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              </TableHead>
              <TableHead
                className="relative group"
                style={{ width: `${columnWidths.adsetId}px`, minWidth: `${columnWidths.adsetId}px`, maxWidth: `${columnWidths.adsetId}px` }}
              >
                <div className="flex flex-col gap-0.5 pr-2">
                  <span className="text-xs text-center">AdSet</span>
                  <select
                    value={adsetFilter}
                    onChange={(e) => setAdsetFilter(e.target.value)}
                    className="w-full h-5 text-[10px] bg-transparent border border-border rounded px-1 text-center truncate focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="all">Todos</option>
                    {adsetOptions.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <ResizeHandle columnKey="adsetId" onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
              </TableHead>
              <ResizableHeader label="Copies" columnKey="copies" width={columnWidths.copies} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'copies' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Creativos" columnKey="creativos" width={columnWidths.creativos} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'creativos' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="Ads" columnKey="ads" width={columnWidths.ads} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered sortable sortDirection={sortColumn === 'ads' ? sortDir : null} onSort={handleSort} />
              <ResizableHeader label="On/Off" columnKey="status" width={columnWidths.status} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} centered />
              <ResizableHeader label="" columnKey="actions" width={columnWidths.actions} onResize={handleColumnResize} onResizeEnd={handleResizeEnd} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedPackages.map((pkg) => {
              const data = packageData[pkg.id] || {
                copiesCount: 0,
                creativesCount: 0,
                uploadedCreativesCount: 0,
                adAccountId: '',
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
                          <a
                            href={buildPackageUrl(pkg.tc_package_id, pkg.title)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-sm truncate text-blue-600 hover:underline"
                            title={pkg.title}
                          >
                            {pkg.title}
                          </a>
                          {pendingRequests[pkg.id] ? (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleCancelCreativeRequest(pkg.id)
                              }}
                              disabled={cancellingRequest.has(pkg.id)}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-800 shrink-0 hover:bg-red-100 hover:text-red-800 transition-colors cursor-pointer disabled:opacity-50"
                              title="Click para cancelar solicitud de diseño"
                            >
                              {cancellingRequest.has(pkg.id) ? (
                                <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                              ) : (
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                              )}
                              Cancelar solicitud
                            </button>
                          ) : pkg.creative_update_needed ? (
                            <span className="inline-flex items-center gap-1 shrink-0">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setCreativeRequestPkg(pkg)
                                }}
                                className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-800 hover:bg-amber-200 transition-colors cursor-pointer"
                                title="Click para solicitar nuevos creativos"
                              >
                                <AlertTriangle className="h-3 w-3 mr-0.5" />
                                Solicitar
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDismissUpdate(pkg.id)
                                }}
                                disabled={dismissingUpdate.has(pkg.id)}
                                className="inline-flex items-center p-0.5 rounded text-[10px] text-muted-foreground hover:bg-red-100 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-50"
                                title="Descartar — no necesita actualización"
                              >
                                {dismissingUpdate.has(pkg.id) ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <X className="h-3 w-3" />
                                )}
                              </button>
                            </span>
                          ) : null}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {formatPrice(pkg.current_price_per_pax, pkg.currency)} · {pkg.nights_count}N
                          {(() => {
                            const oldPrice = pkg.price_at_creative_creation || pkg.original_price_per_pax
                            if (!pkg.creative_update_needed || !oldPrice || oldPrice === pkg.current_price_per_pax) return null
                            const pctChange = Math.round(((pkg.current_price_per_pax - oldPrice) / oldPrice) * 100)
                            return (
                              <span className="text-amber-600 ml-1">
                                (era {formatPrice(oldPrice, pkg.currency)} · {pctChange > 0 ? '↑' : '↓'}{Math.abs(pctChange)}%)
                              </span>
                            )
                          })()}
                        </span>
                      </div>
                    </TableCell>

                    {/* Created At */}
                    <TableCell className="text-center text-xs" style={{ width: columnWidths.creado, minWidth: columnWidths.creado, maxWidth: columnWidths.creado }}>
                      {pkg.created_at ? (
                        <span>{formatShortDate(pkg.created_at)}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
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

                    {/* Ad Account */}
                    <TableCell style={{ width: columnWidths.adAccountId, minWidth: columnWidths.adAccountId, maxWidth: columnWidths.adAccountId }}>
                      <div className="flex flex-col items-center gap-0.5">
                        <Input
                          placeholder="act_..."
                          value={data.adAccountId ?? ''}
                          onChange={(e) => updatePackageField(pkg.id, 'adAccountId', e.target.value)}
                          className={`w-full h-6 text-[10px] text-center font-mono text-muted-foreground ${
                            data.adAccountId ? 'border-blue-500' : ''
                          }`}
                        />
                      </div>
                    </TableCell>

                    {/* Campaign */}
                    <TableCell style={{ width: columnWidths.campaignId, minWidth: columnWidths.campaignId, maxWidth: columnWidths.campaignId }}>
                      <div className="flex flex-col items-center gap-0.5">
                        {data.campaignName && (
                          <span className="text-xs font-semibold text-green-700 truncate w-full text-center leading-tight" title={data.campaignName}>
                            {data.campaignName}
                          </span>
                        )}
                        {data.campaignId && !data.campaignName && (
                          <span className="text-[10px] text-red-400 italic">No encontrada</span>
                        )}
                        <Input
                          placeholder="Campaign ID"
                          value={data.campaignId ?? ''}
                          onChange={(e) => updatePackageField(pkg.id, 'campaignId', e.target.value)}
                          onFocus={() => handleFieldFocus(pkg.id, 'campaignId')}
                          className={`w-full h-6 text-[10px] text-center font-mono text-muted-foreground ${
                            data.campaignName ? 'border-green-500' :
                            data.campaignId ? 'border-red-400' : ''
                          }`}
                        />
                      </div>
                    </TableCell>

                    {/* AdSet */}
                    <TableCell style={{ width: columnWidths.adsetId, minWidth: columnWidths.adsetId, maxWidth: columnWidths.adsetId }}>
                      <div className="flex flex-col items-center gap-0.5">
                        {data.adSetName && (
                          <span className="text-xs font-semibold text-green-700 truncate w-full text-center leading-tight" title={data.adSetName}>
                            {data.adSetName}
                          </span>
                        )}
                        {data.adSetId && !data.adSetName && (
                          <span className="text-[10px] text-red-400 italic">No encontrado</span>
                        )}
                        <Input
                          placeholder="AdSet ID *"
                          value={data.adSetId ?? ''}
                          onChange={(e) => updatePackageField(pkg.id, 'adSetId', e.target.value)}
                          onFocus={() => handleFieldFocus(pkg.id, 'adSetId')}
                          className={`w-full h-6 text-[10px] text-center font-mono text-muted-foreground ${
                            data.adSetName ? 'border-green-500' :
                            data.adSetId ? 'border-red-400' : ''
                          }`}
                        />
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

                    {/* Actions */}
                    <TableCell style={{ width: columnWidths.actions, minWidth: columnWidths.actions, maxWidth: columnWidths.actions }}>
                      <div className="flex items-center gap-1">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={removingAds.has(pkg.id) || removingFromMarketing.has(pkg.id) || data.togglingAds}>
                              {(removingAds.has(pkg.id) || removingFromMarketing.has(pkg.id)) ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <MoreVertical className="h-4 w-4" />
                              )}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {pkg.ads_created_count > 0 && (
                              <>
                                <DropdownMenuItem
                                  onClick={() => handleToggleAds(pkg.id, true)}
                                  disabled={!data.adsActive}
                                >
                                  <CirclePause className="h-4 w-4 mr-2" />
                                  Pausar anuncios
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setConfirmRemovePackageId(pkg.id)}
                                  className="text-red-600 focus:text-red-600"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Quitar anuncios
                                </DropdownMenuItem>
                              </>
                            )}
                            <DropdownMenuItem
                              onClick={() => setImportAdsPkg(pkg)}
                            >
                              <Link2 className="h-4 w-4 mr-2" />
                              Importar anuncios
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setConfirmRemoveFromMarketing(pkg.id)}
                              className="text-red-600 focus:text-red-600"
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              Quitar de marketing
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
                      </div>
                    </TableCell>
                  </TableRow>

                  {/* Expanded Row */}
                  {isExpanded && (
                    <TableRow key={`${pkg.id}-expanded`}>
                      <TableCell colSpan={13} className="bg-muted/10 p-0">
                        <PackageRowExpanded
                          pkg={pkg}
                          adAccountId={data.adAccountId}
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
          onSuccess={(requestId: number) => {
            // Clear the creative_update_needed flag locally
            setPackages(prev =>
              prev.map(p =>
                p.id === creativeRequestPkg.id
                  ? { ...p, creative_update_needed: false }
                  : p
              )
            )
            // Track the pending request so "Cancelar solicitud" appears
            setPendingRequests(prev => ({ ...prev, [creativeRequestPkg.id]: requestId }))
          }}
        />
      )}

      {/* Confirm Remove Ads Dialog */}
      <AlertDialog open={confirmRemovePackageId !== null} onOpenChange={(open) => { if (!open) setConfirmRemovePackageId(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar anuncios</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará todos los anuncios de Meta para este paquete. Los anuncios serán removidos de la plataforma y no podrán reactivarse.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemovePackageId && handleRemoveAllAds(confirmRemovePackageId)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Quitar anuncios
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm Remove from Marketing Dialog */}
      <AlertDialog open={confirmRemoveFromMarketing !== null} onOpenChange={(open) => { if (!open) setConfirmRemoveFromMarketing(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Quitar de marketing</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción quitará el paquete del módulo de marketing y lo devolverá al estado &quot;importado&quot;.
              {packages.find(p => p.id === confirmRemoveFromMarketing)?.ads_created_count ? ' También se eliminarán todos los anuncios de Meta.' : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmRemoveFromMarketing && handleRemoveFromMarketing(confirmRemoveFromMarketing)}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Quitar de marketing
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Import Ads Modal */}
      {importAdsPkg && (
        <ImportAdsModal
          open={!!importAdsPkg}
          onClose={() => setImportAdsPkg(null)}
          packageId={importAdsPkg.id}
          packageTitle={importAdsPkg.title}
          onSuccess={(adsCreatedCount) => {
            setPackages(prev =>
              prev.map(p =>
                p.id === importAdsPkg.id
                  ? { ...p, ads_created_count: adsCreatedCount }
                  : p
              )
            )
            setPackageData(prev => ({
              ...prev,
              [importAdsPkg.id]: {
                ...prev[importAdsPkg.id],
                adsActive: true,
              }
            }))
          }}
        />
      )}
    </div>
  )
}
