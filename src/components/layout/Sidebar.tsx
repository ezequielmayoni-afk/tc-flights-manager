'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Plane,
  LayoutDashboard,
  LogOut,
  Package,
  ChevronDown,
  ChevronRight,
  FileText,
  Ticket,
  Briefcase,
  MapPin,
  RefreshCw,
  Search,
  Palette,
  Megaphone,
  ShoppingCart,
  BarChart3,
  Users,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  section?: string // Section required to view this item
}

const cuposItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'cupos' },
  { name: 'Vuelos', href: '/flights', icon: Plane, section: 'cupos' },
  { name: 'Reservas', href: '/reservations', icon: Ticket, section: 'cupos' },
  { name: 'Logs', href: '/logs', icon: FileText, section: 'cupos' },
]

const productosItems: NavItem[] = [
  { name: 'Paquetes', href: '/packages', icon: Briefcase, section: 'productos' },
  { name: 'Cotización manual', href: '/packages/requote', icon: RefreshCw, section: 'productos' },
  { name: 'SEO', href: '/packages/seo', icon: Search, section: 'productos' },
  { name: 'Diseño', href: '/packages/design', icon: Palette, section: 'diseño' },
  { name: 'Marketing', href: '/packages/marketing', icon: Megaphone, section: 'marketing' },
  { name: 'Comercial', href: '/packages/comercial', icon: ShoppingCart, section: 'comercial' },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const { isAdmin, canAccessSection } = useAuth()

  // Filter items based on user's role
  const visibleCuposItems = cuposItems.filter(item =>
    !item.section || canAccessSection(item.section)
  )
  const visibleProductosItems = productosItems.filter(item =>
    !item.section || canAccessSection(item.section)
  )

  // Check if any visible item is active to auto-expand
  const isCuposActive = visibleCuposItems.some(item =>
    pathname === item.href || pathname.startsWith(item.href)
  )
  const isProductosActive = visibleProductosItems.some(item =>
    pathname === item.href || pathname.startsWith(item.href)
  )

  // Track expanded state for each section
  // Initialize with false to avoid hydration mismatch, useEffect will expand if needed
  const [cuposExpanded, setCuposExpanded] = useState(false)
  const [productosExpanded, setProductosExpanded] = useState(false)

  // Auto-expand when navigating to a page in that section
  useEffect(() => {
    if (isCuposActive) setCuposExpanded(true)
  }, [isCuposActive])

  useEffect(() => {
    if (isProductosActive) setProductosExpanded(true)
  }, [isProductosActive])

  const handleCuposToggle = () => {
    setCuposExpanded(!cuposExpanded)
  }

  const handleProductosToggle = () => {
    setProductosExpanded(!productosExpanded)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  // All menu items for checking more specific matches
  const allMenuItems = [...cuposItems, ...productosItems]

  const isItemActive = (href: string) => {
    // Exact match is always active
    if (pathname === href) return true

    // For startsWith match, check that no other menu item is a more specific match
    if (pathname.startsWith(href + '/')) {
      // Check if any other menu item is more specific and matches
      const hasMoreSpecificMatch = allMenuItems.some(item =>
        item.href !== href &&
        item.href.length > href.length &&
        item.href.startsWith(href) &&
        (pathname === item.href || pathname.startsWith(item.href + '/'))
      )

      // Only active if no more specific match exists
      return !hasMoreSpecificMatch
    }

    return false
  }

  return (
    <div className="flex flex-col h-full w-64 bg-[#1A237E] text-white">
      {/* Logo */}
      <div className="flex items-center gap-2 px-6 py-5 border-b border-[#283593]">
        <div className="bg-[#1DE9B6] rounded-lg p-2">
          <Plane className="h-5 w-5 text-[#1A237E]" />
        </div>
        <span className="font-semibold text-lg">HUB Sí, Viajo</span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {/* CUPOS Group - only show if user can access any cupos items */}
        {visibleCuposItems.length > 0 && (
          <div>
            <button
              onClick={handleCuposToggle}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isCuposActive
                  ? 'bg-[#283593] text-white'
                  : 'text-white/70 hover:bg-[#283593] hover:text-white'
              )}
            >
              <div className="flex items-center gap-3">
                <Package className="h-5 w-5" />
                CUPOS
              </div>
              {cuposExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Cupos Sub-items */}
            {cuposExpanded && (
              <div className="mt-1 ml-4 space-y-1">
                {visibleCuposItems.map((item) => {
                  const isActive = isItemActive(item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                          : 'text-white/70 hover:bg-[#283593] hover:text-white'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* PRODUCTOS Group - only show if user can access any productos items */}
        {visibleProductosItems.length > 0 && (
          <div>
            <button
              onClick={handleProductosToggle}
              className={cn(
                'flex items-center justify-between w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isProductosActive
                  ? 'bg-[#283593] text-white'
                  : 'text-white/70 hover:bg-[#283593] hover:text-white'
              )}
            >
              <div className="flex items-center gap-3">
                <MapPin className="h-5 w-5" />
                PRODUCTOS
              </div>
              {productosExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>

            {/* Productos Sub-items */}
            {productosExpanded && (
              <div className="mt-1 ml-4 space-y-1">
                {visibleProductosItems.map((item) => {
                  const isActive = isItemActive(item.href)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                        isActive
                          ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                          : 'text-white/70 hover:bg-[#283593] hover:text-white'
                      )}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Rendimiento - only show if user can access */}
        {canAccessSection('rendimiento') && (
          <Link
            href="/rendimiento"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              pathname === '/rendimiento'
                ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                : 'text-white/70 hover:bg-[#283593] hover:text-white'
            )}
          >
            <BarChart3 className="h-5 w-5" />
            Rendimiento
          </Link>
        )}

        {/* Admin Section - Only visible to admins (admin or marketing) */}
        {isAdmin && (
          <>
            <div className="my-4 border-t border-[#283593]" />
            <div className="px-3 py-1">
              <span className="text-xs font-semibold text-[#1DE9B6] uppercase tracking-wider">
                Administración
              </span>
            </div>
            <Link
              href="/users"
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                pathname.startsWith('/users')
                  ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                  : 'text-white/70 hover:bg-[#283593] hover:text-white'
              )}
            >
              <Users className="h-5 w-5" />
              Usuarios
            </Link>
          </>
        )}

      </nav>

      {/* Logout */}
      <div className="px-3 py-4 border-t border-[#283593]">
        <Button
          variant="ghost"
          className="w-full justify-start text-white/70 hover:text-white hover:bg-[#283593]"
          onClick={handleLogout}
        >
          <LogOut className="h-5 w-5 mr-3" />
          Cerrar sesión
        </Button>
      </div>
    </div>
  )
}
