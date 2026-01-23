'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Plane,
  Hotel,
  Car,
  Ticket,
  Map,
  Filter,
  Palette,
  Check,
  Loader2,
  X,
  Moon,
  Sparkles,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { DesignModal } from './DesignModal'
import { AIGeneratorModal } from '@/components/design/AIGeneratorModal'
import type { PackageForDesign } from '@/app/(dashboard)/packages/design/page'

interface DesignTableProps {
  packages: PackageForDesign[]
  creativeCounts: Record<number, number>
}

const REQUIRED_CREATIVES = 10 // 5 variants × 2 aspect ratios (4x5 and 9x16)

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
  return `${day}/${month}/${year}`
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

function getDaysUntilExpiration(dateRangeEnd: string | null): number | null {
  if (!dateRangeEnd) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const endDate = new Date(dateRangeEnd)
  const diffTime = endDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function getDaysUntilDeadline(deadline: string | null): number | null {
  if (!deadline) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline + 'T00:00:00')
  const diffTime = deadlineDate.getTime() - today.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

function isDeadlinePassed(deadline: string | null): boolean {
  if (!deadline) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const deadlineDate = new Date(deadline + 'T00:00:00')
  return deadlineDate < today
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

const statusColors: Record<string, string> = {
  imported: 'bg-gray-100 text-gray-700',
  reviewing: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  in_design: 'bg-purple-100 text-purple-700',
  in_marketing: 'bg-orange-100 text-orange-700',
  published: 'bg-emerald-100 text-emerald-700',
  expired: 'bg-red-100 text-red-700',
}

export function DesignTable({ packages, creativeCounts }: DesignTableProps) {
  const router = useRouter()
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [designModalPackage, setDesignModalPackage] = useState<{ id: number; title: string } | null>(null)
  const [aiModalPackage, setAiModalPackage] = useState<{ id: number; title: string } | null>(null)
  const [markingComplete, setMarkingComplete] = useState<number | null>(null)
  const [bulkMarking, setBulkMarking] = useState(false)
  const [bulkUnmarking, setBulkUnmarking] = useState(false)
  const [bulkSendingMarketing, setBulkSendingMarketing] = useState(false)

  // Debounce ref for realtime updates
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Debounced refresh function - prevents multiple rapid refreshes
  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }
    refreshTimeoutRef.current = setTimeout(() => {
      router.refresh()
    }, 500) // 500ms debounce
  }, [router])

  // Memoized date calculations for all packages (avoids recalculating on every render)
  const packageDateInfo = useMemo(() => {
    const info: Record<number, { expired: boolean; daysLeft: number | null; deadlineDays: number | null; deadlinePassed: boolean }> = {}
    for (const pkg of packages) {
      info[pkg.id] = {
        expired: isExpired(pkg.date_range_end),
        daysLeft: getDaysUntilExpiration(pkg.date_range_end),
        deadlineDays: getDaysUntilDeadline(pkg.design_deadline),
        deadlinePassed: isDeadlinePassed(pkg.design_deadline),
      }
    }
    return info
  }, [packages])

  // Memoized filtered packages - only recalculate when dependencies change
  const filteredPackages = useMemo(() => {
    if (statusFilter === 'all') return packages
    if (statusFilter === 'pending') return packages.filter(p => !p.design_completed)
    if (statusFilter === 'completed') return packages.filter(p => p.design_completed)
    if (statusFilter === 'expired') return packages.filter(p => packageDateInfo[p.id]?.expired)
    return packages.filter(p => p.status === statusFilter)
  }, [packages, statusFilter, packageDateInfo])

  // Mark a single package as design completed
  const handleMarkComplete = async (packageId: number) => {
    setMarkingComplete(packageId)
    try {
      const res = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [packageId],
          action: 'design-complete',
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success('Diseño marcado como completado')
        router.refresh()
      } else {
        toast.error(data.error || 'Error al marcar como completado')
      }
    } catch {
      toast.error('Error al marcar como completado')
    } finally {
      setMarkingComplete(null)
    }
  }

  // Bulk mark as complete
  const handleBulkMarkComplete = async () => {
    if (selectedIds.length === 0) return
    setBulkMarking(true)
    try {
      const res = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: selectedIds,
          action: 'design-complete',
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`${data.updated} paquetes marcados como completados`)
        setSelectedIds([])
        router.refresh()
      } else {
        toast.error(data.error || 'Error al marcar como completados')
      }
    } catch {
      toast.error('Error al marcar como completados')
    } finally {
      setBulkMarking(false)
    }
  }

  // Bulk mark as uncomplete
  const handleBulkMarkUncomplete = async () => {
    if (selectedIds.length === 0) return
    setBulkUnmarking(true)
    try {
      const res = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: selectedIds,
          action: 'design-uncomplete',
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`${data.updated} paquetes marcados como pendientes`)
        setSelectedIds([])
        router.refresh()
      } else {
        toast.error(data.error || 'Error al marcar como pendientes')
      }
    } catch {
      toast.error('Error al marcar como pendientes')
    } finally {
      setBulkUnmarking(false)
    }
  }

  // Bulk send to marketing
  const handleBulkSendToMarketing = async () => {
    if (selectedIds.length === 0) return
    setBulkSendingMarketing(true)
    try {
      const res = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: selectedIds,
          action: 'marketing',
        }),
      })

      const data = await res.json()
      if (data.success) {
        toast.success(`${data.updated} paquetes enviados a marketing`)
        setSelectedIds([])
        router.refresh()
      } else {
        toast.error(data.error || 'Error al enviar a marketing')
      }
    } catch {
      toast.error('Error al enviar a marketing')
    } finally {
      setBulkSendingMarketing(false)
    }
  }

  // Update design deadline
  const handleDeadlineChange = async (packageId: number, deadline: string) => {
    try {
      const res = await fetch(`/api/packages/${packageId}/deadline`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ design_deadline: deadline || null }),
      })

      if (!res.ok) {
        throw new Error('Error al actualizar')
      }

      router.refresh()
    } catch {
      toast.error('Error al actualizar la fecha')
    }
  }

  // Realtime subscription with debouncing
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('design-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
        },
        () => {
          // Use debounced refresh to prevent cascading refreshes
          debouncedRefresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      // Clean up any pending timeout on unmount
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [debouncedRefresh])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(filteredPackages.map(p => p.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleSelect = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id])
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id))
    }
  }

  const getStatusBadge = (pkg: PackageForDesign) => {
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
      <Badge className={statusColors[displayStatus] || statusColors.imported}>
        {statusLabels[displayStatus] || displayStatus}
      </Badge>
    )
  }

  return (
    <>
      {/* Actions bar */}
      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Checkbox
            checked={selectedIds.length === filteredPackages.length && filteredPackages.length > 0}
            onCheckedChange={handleSelectAll}
          />
          <span className="text-sm text-muted-foreground">
            {selectedIds.length > 0 ? `${selectedIds.length} seleccionados` : `Seleccionar todos (${filteredPackages.length})`}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <>
              <Button
                variant="default"
                size="sm"
                onClick={handleBulkMarkComplete}
                disabled={bulkMarking || bulkUnmarking || bulkSendingMarketing}
                className="gap-1"
              >
                {bulkMarking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Completados ({selectedIds.length})
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleBulkMarkUncomplete}
                disabled={bulkMarking || bulkUnmarking || bulkSendingMarketing}
                className="gap-1"
              >
                {bulkUnmarking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Pendientes ({selectedIds.length})
              </Button>
              <Button
                variant="default"
                size="sm"
                onClick={handleBulkSendToMarketing}
                disabled={bulkMarking || bulkUnmarking || bulkSendingMarketing}
                className="gap-1 bg-orange-600 hover:bg-orange-700"
              >
                {bulkSendingMarketing ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Megaphone className="h-4 w-4" />
                )}
                Enviar a Marketing ({selectedIds.length})
              </Button>
            </>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px] h-9">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pending">Pendientes</SelectItem>
              <SelectItem value="completed">Completados</SelectItem>
              <SelectItem value="expired">Vencidos</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10"></TableHead>
            <TableHead className="text-xs w-20">ID</TableHead>
            <TableHead className="text-xs">Nombre</TableHead>
            <TableHead className="text-xs w-28">Enviado</TableHead>
            <TableHead className="text-xs w-28">Vigencia</TableHead>
            <TableHead className="text-xs w-36">Deadline</TableHead>
            <TableHead className="text-xs w-20">Noches</TableHead>
            <TableHead className="text-xs w-24">Servicios</TableHead>
            <TableHead className="text-xs w-28 text-right">Precio</TableHead>
            <TableHead className="text-xs w-28">Estado</TableHead>
            <TableHead className="text-xs w-28">Diseño</TableHead>
            <TableHead className="text-xs w-32">Creativos</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredPackages.map((pkg) => {
            const expired = isExpired(pkg.date_range_end)

            return (
              <TableRow key={pkg.id} className={expired ? 'opacity-60' : ''}>
                <TableCell>
                  <Checkbox
                    checked={selectedIds.includes(pkg.id)}
                    onCheckedChange={(checked) => handleSelect(pkg.id, checked as boolean)}
                  />
                </TableCell>

                <TableCell className="text-xs font-mono text-muted-foreground">
                  {pkg.tc_package_id}
                </TableCell>

                <TableCell>
                  <span className="text-sm font-medium line-clamp-2">
                    {pkg.title}
                  </span>
                </TableCell>

                <TableCell className="text-xs text-muted-foreground">
                  {formatDate(pkg.send_to_design_at)}
                </TableCell>

                <TableCell className="text-xs">
                  {pkg.date_range_start || pkg.date_range_end ? (
                    <div className="flex flex-col">
                      <span>{formatShortDate(pkg.date_range_start)}</span>
                      <span className="text-muted-foreground">{formatShortDate(pkg.date_range_end)}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex flex-col gap-1">
                    <Input
                      type="date"
                      value={pkg.design_deadline || ''}
                      onChange={(e) => handleDeadlineChange(pkg.id, e.target.value)}
                      className="h-8 w-32 text-xs"
                    />
                    {pkg.design_deadline && (() => {
                      const daysLeft = getDaysUntilDeadline(pkg.design_deadline)
                      const passed = isDeadlinePassed(pkg.design_deadline)
                      if (passed) {
                        return <span className="text-xs text-red-600 font-medium">Vencido</span>
                      }
                      if (daysLeft !== null) {
                        const colorClass = daysLeft <= 2 ? 'text-red-600' : daysLeft <= 5 ? 'text-amber-600' : 'text-muted-foreground'
                        return <span className={`text-xs ${colorClass}`}>{daysLeft} días</span>
                      }
                      return null
                    })()}
                  </div>
                </TableCell>

                <TableCell className="text-center">
                  {pkg.nights_count ? (
                    <div className="flex items-center justify-center gap-1">
                      <Moon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm font-medium">{pkg.nights_count}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>

                <TableCell>
                  <div className="flex items-center gap-1 text-muted-foreground">
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

                <TableCell className="text-right">
                  <span className="font-medium text-sm">
                    {formatCurrency(pkg.current_price_per_pax, pkg.currency)}
                  </span>
                </TableCell>

                <TableCell>
                  {getStatusBadge(pkg)}
                </TableCell>

                <TableCell>
                  {(() => {
                    const creativeCount = creativeCounts[pkg.id] || 0
                    const hasAllCreatives = creativeCount >= REQUIRED_CREATIVES

                    if (pkg.design_completed) {
                      return (
                        <div className="flex flex-col gap-1">
                          <Badge className="bg-green-100 text-green-700">
                            Completado
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {creativeCount}/{REQUIRED_CREATIVES} creativos
                          </span>
                        </div>
                      )
                    }

                    return (
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMarkComplete(pkg.id)}
                          disabled={markingComplete === pkg.id || !hasAllCreatives}
                          className="gap-1"
                          title={!hasAllCreatives ? `Faltan ${REQUIRED_CREATIVES - creativeCount} creativos para completar` : 'Marcar como completado'}
                        >
                          {markingComplete === pkg.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Completar
                        </Button>
                        <span className={`text-xs ${hasAllCreatives ? 'text-green-600' : 'text-amber-600'}`}>
                          {creativeCount}/{REQUIRED_CREATIVES} creativos
                        </span>
                      </div>
                    )
                  })()}
                </TableCell>

                <TableCell>
                  <div className="flex gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled
                      className="gap-1 opacity-50 cursor-not-allowed"
                      title="Generación con IA temporalmente deshabilitada"
                    >
                      <Sparkles className="h-4 w-4 text-gray-400" />
                      IA
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDesignModalPackage({ id: pkg.id, title: pkg.title })}
                      className="gap-1"
                    >
                      <Palette className="h-4 w-4" />
                      Subir
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {filteredPackages.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {packages.length === 0 ? 'No hay paquetes enviados a diseño' : 'No hay paquetes con ese estado'}
        </div>
      )}

      {/* Design Modal */}
      {designModalPackage && (
        <DesignModal
          packageId={designModalPackage.id}
          packageTitle={designModalPackage.title}
          open={!!designModalPackage}
          onOpenChange={(open) => !open && setDesignModalPackage(null)}
        />
      )}

      {/* AI Generator Modal */}
      {aiModalPackage && (
        <AIGeneratorModal
          packageId={aiModalPackage.id}
          packageTitle={aiModalPackage.title}
          open={!!aiModalPackage}
          onOpenChange={(open) => !open && setAiModalPackage(null)}
        />
      )}
    </>
  )
}
