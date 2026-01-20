'use client'

import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Calendar,
  MapPin,
  Moon,
  Users,
  Plane,
  Hotel,
  ExternalLink,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Luggage,
  Briefcase,
} from 'lucide-react'
import { CuposBadge } from './CuposBadge'
import type { PackageForComercial } from '@/types/comercial'

// Build slug from title for URL
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

interface PackageCardProps {
  package: PackageForComercial
}

export function PackageCard({ package: pkg }: PackageCardProps) {
  const formatPrice = (amount: number | null) => {
    if (amount === null || amount === undefined) return '-'
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: pkg.currency || 'USD',
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatShortDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    try {
      return format(new Date(dateStr), 'dd MMM', { locale: es })
    } catch {
      return dateStr
    }
  }

  const formatFullDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es })
    } catch {
      return dateStr
    }
  }

  const firstTransport = pkg.package_transports?.[0]
  const firstHotel = pkg.package_hotels?.[0]
  const destinations = pkg.package_destinations?.map((d) => d.destination_name).join(' → ')

  // Get all flight numbers
  const allFlightNumbers = pkg.package_transports
    ?.map((t) => t.transport_number)
    .filter(Boolean)
    .join(' / ')

  return (
    <Card className="hover:shadow-lg transition-shadow relative overflow-hidden flex flex-col">
      {/* CUPOS BADGE & SUPPLIER - Top Right */}
      <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-1">
        <CuposBadge remaining={pkg.cupos_remaining} total={pkg.cupos_total} />
        {pkg.matched_supplier_name && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5">
            {pkg.matched_supplier_name}
          </Badge>
        )}
      </div>

      <CardHeader className="pb-3">
        <div className="space-y-1">
          {/* TC Package ID */}
          <Badge variant="outline" className="font-mono text-xs w-fit">
            #{pkg.tc_package_id}
          </Badge>

          {/* Title */}
          <CardTitle className="text-lg line-clamp-2 pr-16">{pkg.title}</CardTitle>

          {/* Destinations */}
          {destinations && (
            <div className="flex items-center gap-1 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="line-clamp-1">{destinations}</span>
            </div>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4 flex-1">
        {/* DATE RANGE - Very Important */}
        <div className="bg-blue-50 rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
            <div>
              <p className="text-xs text-blue-600 font-medium">Fechas de Salida</p>
              <p className="text-sm font-semibold text-blue-900">
                {formatShortDate(pkg.date_range_start)} → {formatShortDate(pkg.date_range_end)}
              </p>
            </div>
          </div>
        </div>

        {/* PRICE - Hero Element */}
        <div className="text-center py-2">
          <p className="text-xs text-muted-foreground">Precio por Persona</p>
          <p className="text-3xl font-bold text-green-600">
            {formatPrice(pkg.current_price_per_pax)}
          </p>
          <p className="text-sm text-muted-foreground">
            Total: {formatPrice(pkg.total_price)}
          </p>
          <div className="flex justify-center gap-2 mt-1 flex-wrap">
            <Badge variant="secondary" className="text-xs">
              <Moon className="h-3 w-3 mr-1" />
              {pkg.nights_count || 0} noches
            </Badge>
            <Badge variant="secondary" className="text-xs">
              <Users className="h-3 w-3 mr-1" />
              {pkg.adults_count || 0}A
              {pkg.children_count > 0 && ` + ${pkg.children_count}C`}
              {pkg.infants_count > 0 && ` + ${pkg.infants_count}I`}
            </Badge>
          </div>
        </div>

        {/* FLIGHT INFO */}
        {firstTransport && (
          <div className="border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Plane className="h-4 w-4 text-blue-500" />
              <span>Vuelo</span>
            </div>
            <div className="text-sm">
              <p className="font-medium line-clamp-1">
                {firstTransport.company || 'Aerolínea'}
                {allFlightNumbers && ` (${allFlightNumbers})`}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFullDate(firstTransport.departure_date)}
                {firstTransport.arrival_date &&
                  firstTransport.arrival_date !== firstTransport.departure_date &&
                  ` - ${formatFullDate(firstTransport.arrival_date)}`}
              </p>
            </div>
            <p className="text-xs font-medium text-blue-600">
              Aéreo: {formatPrice(pkg.air_cost)}
              {pkg.air_cost && (pkg.adults_count + pkg.children_count) > 0 && (
                <span className="text-muted-foreground font-normal">
                  {' '}({formatPrice(pkg.air_cost / (pkg.adults_count + pkg.children_count))} pp)
                </span>
              )}
            </p>
            {/* Baggage info */}
            {(firstTransport.baggage_info || firstTransport.checked_baggage || firstTransport.cabin_baggage) && (
              <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                {/* Show baggage_info if available (TC sends this) */}
                {firstTransport.baggage_info && !firstTransport.checked_baggage && (
                  <span className="flex items-center gap-1" title="Equipaje incluido">
                    <Luggage className="h-3.5 w-3.5" />
                    {firstTransport.baggage_info}
                  </span>
                )}
                {firstTransport.checked_baggage && (
                  <span className="flex items-center gap-1" title="Equipaje despachado">
                    <Luggage className="h-3.5 w-3.5" />
                    {firstTransport.checked_baggage}
                  </span>
                )}
                {firstTransport.cabin_baggage && (
                  <span className="flex items-center gap-1" title="Equipaje de mano">
                    <Briefcase className="h-3.5 w-3.5" />
                    {firstTransport.cabin_baggage}
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* HOTEL INFO */}
        {firstHotel && (
          <div className="border rounded-lg p-3 space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Hotel className="h-4 w-4 text-purple-500" />
              <span>Hotel</span>
            </div>
            <div className="text-sm">
              <p className="font-medium line-clamp-1">{firstHotel.hotel_name || 'Hotel'}</p>
              {firstHotel.room_type && (
                <p className="text-xs text-muted-foreground line-clamp-1">
                  {firstHotel.room_type}
                </p>
              )}
              {(firstHotel.board_name || firstHotel.board_type) && (
                <Badge variant="secondary" className="mt-1 text-xs">
                  {firstHotel.board_name || firstHotel.board_type}
                </Badge>
              )}
            </div>
            <p className="text-xs font-medium text-purple-600">
              Tierra: {formatPrice(pkg.land_cost)}
              {pkg.land_cost && (pkg.adults_count + pkg.children_count) > 0 && (
                <span className="text-muted-foreground font-normal">
                  {' '}({formatPrice(pkg.land_cost / (pkg.adults_count + pkg.children_count))} pp)
                </span>
              )}
            </p>
          </div>
        )}

        {/* PRICING BREAKDOWN */}
        <div className="bg-gray-50 rounded-lg p-3">
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div>
              <p className="text-muted-foreground">Aéreo</p>
              <p className="font-semibold">{formatPrice(pkg.air_cost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Tierra</p>
              <p className="font-semibold">{formatPrice(pkg.land_cost)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Fee</p>
              <p className="font-semibold">{formatPrice(pkg.agency_fee)}</p>
            </div>
          </div>
        </div>

        {/* REQUOTE INFO - Only show if monitor enabled and has requote data */}
        {pkg.monitor_enabled && pkg.last_requote_at && (
          <div className={`rounded-lg p-3 ${
            pkg.requote_variance_pct && pkg.requote_variance_pct > 0
              ? 'bg-red-50 border border-red-200'
              : pkg.requote_variance_pct && pkg.requote_variance_pct < 0
                ? 'bg-green-50 border border-green-200'
                : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="flex items-center gap-2 mb-2">
              <RefreshCw className="h-4 w-4 text-amber-600" />
              <span className="text-xs font-medium text-amber-700">Última Recotización</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Últ. Recot.</p>
                <p className="font-semibold flex items-center gap-1">
                  {formatPrice(pkg.requote_price)}
                  {pkg.requote_variance_pct !== null && pkg.requote_variance_pct !== 0 && (
                    <span className={`flex items-center ${
                      pkg.requote_variance_pct > 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {pkg.requote_variance_pct > 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      <span className="text-[10px]">
                        {pkg.requote_variance_pct > 0 ? '+' : ''}{pkg.requote_variance_pct.toFixed(1)}%
                      </span>
                    </span>
                  )}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Fecha Recot.</p>
                <p className="font-semibold">{formatFullDate(pkg.last_requote_at)}</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Card Footer - Actions */}
      <CardFooter className="pt-0">
        <Button variant="outline" size="sm" className="w-full" asChild>
          <a href={buildPackageUrl(pkg.tc_package_id, pkg.title)} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4 mr-1" />
            Ver en Web
          </a>
        </Button>
      </CardFooter>
    </Card>
  )
}
