'use client'

import { useState, useMemo } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Search, X, Package, Calendar, Building2 } from 'lucide-react'
import { PackageCard } from './PackageCard'
import type { PackageForComercial } from '@/types/comercial'

// Month names in Spanish
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

// Normalize string by removing accents/diacritics
function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

interface Supplier {
  id: number
  name: string
}

interface ComercialDashboardProps {
  packages: PackageForComercial[]
  destinations: string[]
  suppliers: Supplier[]
}

export function ComercialDashboard({
  packages: initialPackages,
  destinations,
  suppliers,
}: ComercialDashboardProps) {
  const [packages] = useState(initialPackages)
  const [search, setSearch] = useState('')
  const [destino, setDestino] = useState('all')
  const [cuposFilter, setCuposFilter] = useState('all')
  const [mesFilter, setMesFilter] = useState('all')
  const [proveedorFilter, setProveedorFilter] = useState('all')

  // Get available months from packages (based on first transport departure date)
  const availableMonths = useMemo(() => {
    const monthsSet = new Map<string, string>() // key: "2026-01", value: "Enero 2026"

    for (const pkg of packages) {
      // Use the first transport's departure date
      const departureDate = pkg.package_transports?.[0]?.departure_date || pkg.date_range_start
      if (departureDate) {
        const date = new Date(departureDate)
        const year = date.getFullYear()
        const month = date.getMonth()
        const key = `${year}-${String(month + 1).padStart(2, '0')}`
        const label = `${MONTH_NAMES[month]} ${year}`
        monthsSet.set(key, label)
      }
    }

    // Sort by date
    return Array.from(monthsSet.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([value, label]) => ({ value, label }))
  }, [packages])

  // Filtered packages
  const filteredPackages = useMemo(() => {
    return packages.filter((pkg) => {
      // Search filter (accent-insensitive)
      if (search) {
        const searchNormalized = normalizeText(search)
        const matchesTitle = pkg.title ? normalizeText(pkg.title).includes(searchNormalized) : false
        const matchesId = pkg.tc_package_id?.toString().includes(search)
        const matchesDestination = pkg.package_destinations?.some((d) =>
          d.destination_name ? normalizeText(d.destination_name).includes(searchNormalized) : false
        )
        if (!matchesTitle && !matchesId && !matchesDestination) return false
      }

      // Destination filter
      if (destino && destino !== 'all') {
        const hasDestination = pkg.package_destinations?.some(
          (d) => d.destination_name === destino
        )
        if (!hasDestination) return false
      }

      // Cupos filter - uses matched_supplier_id from local flights
      if (cuposFilter !== 'all') {
        // "Con Cupos" = paquetes que matchean con algún vuelo local
        const hasMatchedFlight = pkg.matched_supplier_id !== null
        const hasCupoData = pkg.cupos_total > 0

        if (cuposFilter === 'available' && !hasMatchedFlight) return false
        if (cuposFilter === 'low' && (!hasCupoData || pkg.cupos_remaining <= 0 || pkg.cupos_remaining > 5))
          return false
        if (cuposFilter === 'none' && (!hasCupoData || pkg.cupos_remaining > 0)) return false
      }

      // Provider filter - uses matched_supplier_id from local flights
      if (proveedorFilter !== 'all') {
        const selectedSupplierId = parseInt(proveedorFilter, 10)
        if (pkg.matched_supplier_id !== selectedSupplierId) return false
      }

      // Month filter (based on first transport departure date)
      if (mesFilter !== 'all') {
        const departureDate = pkg.package_transports?.[0]?.departure_date || pkg.date_range_start
        if (!departureDate) return false

        const date = new Date(departureDate)
        const pkgMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        if (pkgMonth !== mesFilter) return false
      }

      return true
    })
  }, [packages, search, destino, cuposFilter, mesFilter, proveedorFilter])

  const clearFilters = () => {
    setSearch('')
    setDestino('all')
    setCuposFilter('all')
    setMesFilter('all')
    setProveedorFilter('all')
  }

  const hasFilters = search || destino !== 'all' || cuposFilter !== 'all' || mesFilter !== 'all' || proveedorFilter !== 'all'

  return (
    <div className="space-y-6">
      {/* Filter Bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar destino, ID o paquete..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          {/* Destination Filter */}
          <Select value={destino} onValueChange={setDestino}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los destinos</SelectItem>
              {destinations.map((dest) => (
                <SelectItem key={dest} value={dest}>
                  {dest}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Cupos Filter */}
          <Select value={cuposFilter} onValueChange={setCuposFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Cupos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="available">Con Cupos</SelectItem>
              <SelectItem value="low">Pocos (1-5)</SelectItem>
              <SelectItem value="none">Sin Cupos</SelectItem>
            </SelectContent>
          </Select>

          {/* Month Filter */}
          <Select value={mesFilter} onValueChange={setMesFilter}>
            <SelectTrigger className="w-[180px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Mes de salida" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los meses</SelectItem>
              {availableMonths.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Provider Filter - uses supplier IDs */}
          <Select value={proveedorFilter} onValueChange={setProveedorFilter}>
            <SelectTrigger className="w-[180px]">
              <Building2 className="h-4 w-4 mr-2" />
              <SelectValue placeholder="Proveedor" />
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

          {/* Clear Filters */}
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1">
              <X className="h-4 w-4" />
              Limpiar
            </Button>
          )}

          {/* Results Count */}
          <Badge variant="outline" className="ml-auto">
            {filteredPackages.length} paquete{filteredPackages.length !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Cards Grid */}
      {filteredPackages.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredPackages.map((pkg) => (
            <PackageCard key={pkg.id} package={pkg} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Package className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-1">No se encontraron paquetes</h3>
          <p className="text-muted-foreground text-sm">
            {hasFilters
              ? 'Intenta ajustar los filtros de búsqueda'
              : 'No hay paquetes en marketing actualmente'}
          </p>
          {hasFilters && (
            <Button variant="outline" size="sm" onClick={clearFilters} className="mt-4">
              Limpiar filtros
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
