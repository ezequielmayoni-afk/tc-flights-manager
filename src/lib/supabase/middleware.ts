import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type UserRole = 'admin' | 'marketing' | 'producto' | 'diseño'

// Routes that require admin role (admin or marketing)
const ADMIN_ROUTES = ['/users']

// Role-based route protection configuration
// Maps route prefixes to the section they require
const SECTION_ROUTES: Record<string, string> = {
  '/dashboard': 'cupos',
  '/flights': 'cupos',
  '/reservations': 'cupos',
  '/logs': 'cupos',
  '/packages/design': 'diseño',
  '/packages/marketing': 'marketing',
  '/packages/comercial': 'comercial',
  '/packages': 'productos',
  '/rendimiento': 'rendimiento',
}

// Role permissions (must match client-side config)
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  marketing: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  producto: ['cupos', 'productos', 'comercial', 'rendimiento'],
  diseño: ['productos', 'diseño'],
}

function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'marketing'
}

function canAccessSection(role: UserRole, section: string): boolean {
  const sections = ROLE_PERMISSIONS[role]
  return sections?.includes(section) || false
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Protected routes - redirect to login if not authenticated
  const isAuthRoute = request.nextUrl.pathname.startsWith('/login') ||
                      request.nextUrl.pathname.startsWith('/register')
  const isApiRoute = request.nextUrl.pathname.startsWith('/api')

  if (!user && !isAuthRoute && !isApiRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect logged-in users away from auth pages
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // For protected routes, check role-based access
  if (user && !isApiRoute) {
    // Get user's role from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = (profile?.role || 'producto') as UserRole

    // Check admin routes
    const isAdminRoute = ADMIN_ROUTES.some(route =>
      request.nextUrl.pathname.startsWith(route)
    )

    if (isAdminRoute && !isAdminRole(userRole)) {
      // Not admin - redirect to dashboard with error
      const url = request.nextUrl.clone()
      url.pathname = '/'
      url.searchParams.set('error', 'unauthorized')
      return NextResponse.redirect(url)
    }

    // Check section-based routes (only for non-admin routes)
    if (!isAdminRoute) {
      // Find matching route prefix (more specific routes first)
      const sortedRoutes = Object.keys(SECTION_ROUTES).sort((a, b) => b.length - a.length)
      const matchedRoute = sortedRoutes.find(route =>
        request.nextUrl.pathname.startsWith(route)
      )

      if (matchedRoute) {
        const requiredSection = SECTION_ROUTES[matchedRoute]
        if (!canAccessSection(userRole, requiredSection)) {
          // User doesn't have access to this section
          const url = request.nextUrl.clone()
          url.pathname = '/'
          url.searchParams.set('error', 'unauthorized')
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
