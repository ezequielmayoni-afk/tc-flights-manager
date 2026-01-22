'use client'

import { useState, useEffect, useMemo } from 'react'
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

interface NavItem {
  name: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  section?: string
}

const cuposItems: NavItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, section: 'cupos' },
  { name: 'Vuelos', href: '/flights', icon: Plane, section: 'cupos' },
  { name: 'Reservas', href: '/reservations', icon: Ticket, section: 'cupos' },
  { name: 'Logs', href: '/logs', icon: FileText, section: 'cupos' },
]

const productosItems: NavItem[] = [
  { name: 'Paquetes', href: '/packages', icon: Briefcase, section: 'productos' },
  { name: 'Cotización manual', href: '/packages/requote', icon: RefreshCw, section: 'requote' },
  { name: 'SEO', href: '/packages/seo', icon: Search, section: 'seo' },
  { name: 'Diseño', href: '/packages/design', icon: Palette, section: 'diseño' },
  { name: 'Marketing', href: '/packages/marketing', icon: Megaphone, section: 'marketing' },
  { name: 'Comercial', href: '/packages/comercial', icon: ShoppingCart, section: 'comercial' },
]

// Role permissions - must match middleware
const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users', 'seo', 'requote'],
  marketing: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users', 'seo', 'requote'],
  producto: ['cupos', 'productos', 'comercial', 'rendimiento', 'seo', 'requote'],
  diseño: ['productos', 'diseño', 'seo'],
  ventas: ['productos', 'comercial'],
}

// Static shell component - no hooks, no state, just static JSX
function SidebarShell() {
  return (
    <div className="flex flex-col h-full w-64 bg-[#1A237E] text-white">
      <div className="flex items-center gap-2 px-6 py-5 border-b border-[#283593]">
        <div className="bg-[#1DE9B6] rounded-lg p-2">
          <Plane className="h-5 w-5 text-[#1A237E]" />
        </div>
        <span className="font-semibold text-lg">HUB Sí, Viajo</span>
      </div>
      <nav className="flex-1 px-3 py-4">
        <div className="animate-pulse space-y-2">
          <div className="h-10 bg-[#283593] rounded-lg" />
          <div className="h-10 bg-[#283593] rounded-lg" />
        </div>
      </nav>
    </div>
  )
}

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  // All state that affects rendering
  const [isMounted, setIsMounted] = useState(false)
  const [userRole, setUserRole] = useState<string | null>(null)
  const [cuposExpanded, setCuposExpanded] = useState(false)
  const [productosExpanded, setProductosExpanded] = useState(false)

  // Fetch user role on mount
  useEffect(() => {
    let mounted = true

    const fetchRole = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (user && mounted) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('role')
            .eq('id', user.id)
            .single<{ role: string }>()

          if (mounted) {
            setUserRole(profile?.role || 'producto')
            setIsMounted(true)
          }
        } else if (mounted) {
          setUserRole('producto')
          setIsMounted(true)
        }
      } catch {
        if (mounted) {
          setUserRole('producto')
          setIsMounted(true)
        }
      }
    }

    fetchRole()

    return () => { mounted = false }
  }, [supabase])

  // Compute permissions based on role
  const permissions = useMemo(() => {
    if (!userRole) return []
    return ROLE_PERMISSIONS[userRole] || []
  }, [userRole])

  const canAccessSection = (section: string) => permissions.includes(section)
  const isAdmin = userRole === 'admin' || userRole === 'marketing'

  // Filter items
  const visibleCuposItems = useMemo(() =>
    cuposItems.filter(item => !item.section || canAccessSection(item.section)),
    [permissions]
  )

  const visibleProductosItems = useMemo(() =>
    productosItems.filter(item => !item.section || canAccessSection(item.section)),
    [permissions]
  )

  // Check active sections
  const isCuposActive = visibleCuposItems.some(item =>
    pathname === item.href || pathname.startsWith(item.href + '/')
  )
  const isProductosActive = visibleProductosItems.some(item =>
    pathname === item.href || pathname.startsWith(item.href + '/')
  )

  // Auto-expand on navigation
  useEffect(() => {
    if (isMounted && isCuposActive) setCuposExpanded(true)
  }, [isMounted, isCuposActive])

  useEffect(() => {
    if (isMounted && isProductosActive) setProductosExpanded(true)
  }, [isMounted, isProductosActive])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const allMenuItems = [...cuposItems, ...productosItems]

  const isItemActive = (href: string) => {
    if (pathname === href) return true
    if (pathname.startsWith(href + '/')) {
      const hasMoreSpecificMatch = allMenuItems.some(item =>
        item.href !== href &&
        item.href.length > href.length &&
        item.href.startsWith(href) &&
        (pathname === item.href || pathname.startsWith(item.href + '/'))
      )
      return !hasMoreSpecificMatch
    }
    return false
  }

  // Show shell until mounted and role is fetched
  if (!isMounted) {
    return <SidebarShell />
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
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* CUPOS Group */}
        {visibleCuposItems.length > 0 && (
          <div>
            <button
              onClick={() => setCuposExpanded(!cuposExpanded)}
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
              {cuposExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {cuposExpanded && (
              <div className="mt-1 ml-4 space-y-1">
                {visibleCuposItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isItemActive(item.href)
                        ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                        : 'text-white/70 hover:bg-[#283593] hover:text-white'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* PRODUCTOS Group */}
        {visibleProductosItems.length > 0 && (
          <div>
            <button
              onClick={() => setProductosExpanded(!productosExpanded)}
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
              {productosExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>

            {productosExpanded && (
              <div className="mt-1 ml-4 space-y-1">
                {visibleProductosItems.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                      isItemActive(item.href)
                        ? 'bg-[#1DE9B6] text-[#1A237E] font-semibold'
                        : 'text-white/70 hover:bg-[#283593] hover:text-white'
                    )}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Rendimiento */}
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

        {/* Admin Section */}
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
