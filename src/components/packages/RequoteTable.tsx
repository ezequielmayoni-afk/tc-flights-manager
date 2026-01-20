'use client'

import { useState, useEffect } from 'react'
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
import { Badge } from '@/components/ui/badge'
import {
  RefreshCw,
  EyeOff,
  Loader2,
  ExternalLink,
  Check,
  CheckCircle2,
  Plane,
  Hotel,
  Car,
  Map,
  Ticket,
  Palette,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CreativeRequestModal } from './CreativeRequestModal'

type PackageNeedingRequote = {
  id: number
  tc_package_id: number
  title: string
  date_range_start: string | null
  date_range_end: string | null
  current_price_per_pax: number | null
  currency: string
  target_price: number | null
  requote_price: number | null
  requote_variance_pct: number | null
  last_requote_at: string | null
  air_cost: number | null
  land_cost: number | null
  adults_count: number
  children_count: number
  // Status
  status: string
  send_to_design: boolean
  send_to_marketing: boolean
  // Services counts
  transports_count: number
  hotels_count: number
  transfers_count: number
  cars_count: number
  tickets_count: number
  tours_count: number
  // Flight info
  airline_code: string | null
  airline_name: string | null
  flight_numbers: string | null
  flight_departure_date: string | null
  // Hotels
  package_hotels: {
    hotel_name: string | null
    board_type: string | null
  }[]
}

interface RequoteTableProps {
  packages: PackageNeedingRequote[]
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

function formatCurrency(amount: number | null, currency: string): string {
  if (amount === null || amount === 0) return '-'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatShortDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: 'short',
  })
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear()
  return `${day}-${month}-${year}`
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

export function RequoteTable({ packages }: RequoteTableProps) {
  const router = useRouter()
  const [refreshingId, setRefreshingId] = useState<number | null>(null)
  const [deactivatingId, setDeactivatingId] = useState<number | null>(null)
  const [acceptingId, setAcceptingId] = useState<number | null>(null)
  const [completingId, setCompletingId] = useState<number | null>(null)
  const [creativeRequestPackage, setCreativeRequestPackage] = useState<PackageNeedingRequote | null>(null)

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('requote-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'packages',
        },
        () => {
          router.refresh()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [router])

  const handleRefresh = async (pkg: PackageNeedingRequote) => {
    setRefreshingId(pkg.id)
    try {
      const response = await fetch(`/api/packages/${pkg.id}/refresh`, {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al actualizar el paquete')
      }

      // Just show the new variance without auto-completing
      if (pkg.target_price && data.newPrice) {
        const newVariance = ((data.newPrice - pkg.target_price) / pkg.target_price) * 100
        toast.success(`Precio actualizado (${newVariance > 0 ? '+' : ''}${newVariance.toFixed(1)}%)`)
      } else {
        toast.success('Paquete actualizado desde TC')
      }

      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al actualizar')
    } finally {
      setRefreshingId(null)
    }
  }

  const handleDeactivate = async (packageId: number) => {
    setDeactivatingId(packageId)
    try {
      const response = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [packageId],
          action: 'expired',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al desactivar el paquete')
      }

      toast.success('Paquete desactivado')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al desactivar')
    } finally {
      setDeactivatingId(null)
    }
  }

  const handleAcceptPrice = async (packageId: number) => {
    setAcceptingId(packageId)
    try {
      const response = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [packageId],
          action: 'accept-requote',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al aceptar precio')
      }

      toast.success('Precio aceptado como nuevo objetivo')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al aceptar precio')
    } finally {
      setAcceptingId(null)
    }
  }

  const handleComplete = async (packageId: number) => {
    setCompletingId(packageId)
    try {
      const response = await fetch('/api/packages/bulk-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageIds: [packageId],
          action: 'complete-requote',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error al completar')
      }

      toast.success('Recotización completada')
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Error al completar')
    } finally {
      setCompletingId(null)
    }
  }

  if (packages.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        No hay paquetes pendientes de recotización manual
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs">Paquete</TableHead>
            <TableHead className="text-xs">Salida</TableHead>
            <TableHead className="text-xs text-center">Servicios</TableHead>
            <TableHead className="text-xs text-center">Estado</TableHead>
            <TableHead className="text-xs">Aéreo</TableHead>
            <TableHead className="text-xs">Tierra</TableHead>
            <TableHead className="text-xs text-right">Precio Obj.</TableHead>
            <TableHead className="text-xs text-right">Precio Actual TC</TableHead>
            <TableHead className="text-xs text-right">Últ. Recot.</TableHead>
            <TableHead className="text-xs">Fecha Recot.</TableHead>
            <TableHead className="text-xs text-center">Monitoreo</TableHead>
            <TableHead className="text-xs text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((pkg) => {
            const totalPax = pkg.adults_count + (pkg.children_count || 0)
            const variance = pkg.target_price && pkg.current_price_per_pax
              ? ((pkg.current_price_per_pax - pkg.target_price) / pkg.target_price) * 100
              : null

            return (
              <TableRow key={pkg.id}>
                {/* Paquete */}
                <TableCell>
                  <div className="min-w-0">
                    <a
                      href={buildPackageUrl(pkg.tc_package_id, pkg.title)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-sm hover:underline line-clamp-2 text-blue-600"
                    >
                      {pkg.title}
                    </a>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <span>ID: {pkg.tc_package_id}</span>
                      <a
                        href={buildPackageUrl(pkg.tc_package_id, pkg.title)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline flex items-center gap-1"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                </TableCell>

                {/* Salida */}
                <TableCell className="text-xs whitespace-nowrap">
                  {pkg.date_range_start && pkg.date_range_end ? (
                    <span>
                      {formatShortDate(pkg.date_range_start)} → {formatShortDate(pkg.date_range_end)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>

                {/* Servicios */}
                <TableCell>
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

                {/* Estado - basado en booleanos, no en el campo status */}
                <TableCell className="text-center">
                  {(() => {
                    // Determinar estado real basado en booleanos
                    const realStatus = pkg.send_to_marketing
                      ? 'in_marketing'
                      : pkg.send_to_design
                        ? 'in_design'
                        : pkg.status
                    return (
                      <Badge className={statusColors[realStatus] || statusColors.imported}>
                        {statusLabels[realStatus] || realStatus}
                      </Badge>
                    )
                  })()}
                </TableCell>

                {/* Aéreo */}
                <TableCell>
                  <div className="text-xs">
                    <div className="font-medium">
                      {formatCurrency(pkg.air_cost, pkg.currency)}
                    </div>
                    {pkg.air_cost && totalPax > 0 && (
                      <div className="text-muted-foreground">
                        {formatCurrency(pkg.air_cost / totalPax, pkg.currency)}/pax
                      </div>
                    )}
                    {(pkg.airline_code || pkg.flight_numbers) && (
                      <div className="text-muted-foreground truncate max-w-[120px]" title={`${pkg.airline_code || ''} ${pkg.flight_numbers ? `(${pkg.flight_numbers})` : ''}`}>
                        {pkg.airline_code || ''} {pkg.flight_numbers ? `(${pkg.flight_numbers})` : ''}
                      </div>
                    )}
                  </div>
                </TableCell>

                {/* Tierra */}
                <TableCell>
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

                {/* Precio Obj. */}
                <TableCell className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(pkg.target_price, pkg.currency)}
                  </span>
                </TableCell>

                {/* Precio Actual */}
                <TableCell className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(pkg.current_price_per_pax, pkg.currency)}
                  </span>
                </TableCell>

                {/* Últ. Recot. */}
                <TableCell className="text-right">
                  <span className="text-sm font-medium">
                    {formatCurrency(pkg.requote_price, pkg.currency)}
                  </span>
                </TableCell>

                {/* Fecha Recot. */}
                <TableCell className="text-xs">
                  {pkg.last_requote_at ? formatDate(pkg.last_requote_at) : '-'}
                </TableCell>

                {/* Monitoreo - Variación y Fecha */}
                <TableCell className="text-center">
                  <div className="flex flex-col items-center gap-1">
                    {variance !== null && (
                      <span className={`text-sm font-medium ${variance > 0 ? 'text-red-600' : variance < 0 ? 'text-green-600' : 'text-muted-foreground'}`}>
                        {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                      </span>
                    )}
                    {pkg.last_requote_at && (
                      <span className="text-xs text-muted-foreground">
                        {formatDate(pkg.last_requote_at)}
                      </span>
                    )}
                  </div>
                </TableCell>

                {/* Acciones */}
                <TableCell>
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRefresh(pkg)}
                      disabled={refreshingId === pkg.id || deactivatingId === pkg.id || acceptingId === pkg.id || completingId === pkg.id}
                      className="gap-1 text-xs"
                    >
                      {refreshingId === pkg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3 w-3" />
                      )}
                      Actualizar TC
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleAcceptPrice(pkg.id)}
                      disabled={refreshingId === pkg.id || deactivatingId === pkg.id || acceptingId === pkg.id || completingId === pkg.id}
                      className="gap-1 text-xs text-green-600 hover:text-green-700 hover:bg-green-50"
                    >
                      {acceptingId === pkg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      Aceptar precio
                    </Button>
                    {/* Solo mostrar si está en marketing */}
                    {pkg.send_to_marketing && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCreativeRequestPackage(pkg)}
                        className="gap-1 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50"
                      >
                        <Palette className="h-3 w-3" />
                        Solicitar Creativos
                      </Button>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeactivate(pkg.id)}
                      disabled={refreshingId === pkg.id || deactivatingId === pkg.id || acceptingId === pkg.id || completingId === pkg.id}
                      className="gap-1 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deactivatingId === pkg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <EyeOff className="h-3 w-3" />
                      )}
                      Desactivar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleComplete(pkg.id)}
                      disabled={refreshingId === pkg.id || deactivatingId === pkg.id || acceptingId === pkg.id || completingId === pkg.id}
                      className="gap-1 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      {completingId === pkg.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <CheckCircle2 className="h-3 w-3" />
                      )}
                      Completado
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {/* Creative Request Modal */}
      {creativeRequestPackage && (
        <CreativeRequestModal
          packageId={creativeRequestPackage.id}
          tcPackageId={creativeRequestPackage.tc_package_id}
          packageTitle={creativeRequestPackage.title}
          currentPrice={creativeRequestPackage.current_price_per_pax}
          currency={creativeRequestPackage.currency}
          open={!!creativeRequestPackage}
          onOpenChange={(open) => !open && setCreativeRequestPackage(null)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  )
}
