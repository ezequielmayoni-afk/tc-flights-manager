import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

type UserRole = 'admin' | 'marketing' | 'producto' | 'diseño' | 'ventas'

// Rutas públicas de vuelos.siviajo.com: la landing y los archivos de SEO se
// responden sin pasar por Supabase (no hay sesión que refrescar).
const PUBLIC_PREFIXES = ['/vuelos-baratos', '/robots.txt', '/sitemap.xml']

/**
 * APIs públicas, por path EXACTO (no por prefijo).
 *
 * El autocomplete del buscador consulta una vez por tecla (con debounce), y
 * pasar por `supabase.auth.getUser()` le sumaba un round-trip a cada consulta.
 * La igualdad es a propósito: el resto de `/api/vuelos-baratos` (`resolve`,
 * `routes`, `sweep`) autoriza adentro del handler y tiene que seguir entrando
 * por el camino normal.
 */
const PUBLIC_API_PATHS = ['/api/vuelos-baratos/cities']

// Routes that require admin role (admin or marketing)
const ADMIN_ROUTES = ['/users']

// Role-based route protection configuration
// Maps route prefixes to the section they require
// More specific routes must come before less specific ones in checks
const SECTION_ROUTES: Record<string, string> = {
  '/dashboard': 'cupos',
  '/flights': 'cupos',
  '/reservations': 'cupos',
  '/logs': 'cupos',
  '/packages/design': 'diseño',
  '/packages/marketing': 'marketing',
  '/packages/comercial': 'comercial',
  '/packages/requote': 'requote',
  '/packages/seo': 'seo',
  '/packages': 'productos',
  '/producto': 'producto',
  '/automatizacion': 'automatizacion',
  '/tareas': 'tareas',
  '/rendimiento': 'rendimiento',
  '/vendedores': 'vendedores',
}

// Role permissions (must match client-side config)
const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'vendedores', 'users', 'seo', 'requote', 'tareas', 'automatizacion', 'producto'],
  marketing: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'vendedores', 'users', 'seo', 'requote', 'tareas', 'automatizacion', 'producto'],
  producto: ['cupos', 'productos', 'comercial', 'rendimiento', 'vendedores', 'seo', 'requote', 'tareas', 'producto'],
  diseño: ['productos', 'diseño', 'seo'],
  ventas: ['productos', 'comercial', 'vendedores'],
}

/**
 * El `Host` lo manda el cliente: puede venir con puerto, en mayúsculas o con
 * el punto final del FQDN ('Vuelos.Siviajo.Com.'). Sin normalizar, cualquiera
 * de esas variantes se saltea el bloque del host público.
 */
function normalizeHost(host: string | null | undefined): string {
  return (host ?? '').split(':')[0].trim().toLowerCase().replace(/\.$/, '')
}

function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'marketing'
}

function canAccessSection(role: UserRole, section: string): boolean {
  const sections = ROLE_PERMISSIONS[role]
  return sections?.includes(section) || false
}

// Get the default home page for all users
function getHomePageForRole(_role: UserRole): string {
  // All users go to /packages
  return '/packages'
}

export async function updateSession(request: NextRequest) {
  // El host público (VUELOS_PUBLIC_HOST) sirve SOLO la landing: la raíz se
  // reescribe a /vuelos-baratos y cualquier otra ruta vuelve ahí, así el
  // dashboard no queda expuesto en un dominio sin login. En el host del HUB
  // las mismas rutas siguen siendo públicas, pero el resto pide sesión.
  const pathname = request.nextUrl.pathname
  const isPublicPath =
    PUBLIC_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/')) || PUBLIC_API_PATHS.includes(pathname)
  const publicHost = normalizeHost(process.env.VUELOS_PUBLIC_HOST)
  const host = normalizeHost(request.headers.get('host'))
  if (publicHost && host === publicHost) {
    if (pathname === '/') {
      // Con `new URL('/vuelos-baratos', request.url)` se perdían `?from=`, los
      // `utm_*` y el `gclid` de la campaña: se clona la URL y sólo se cambia
      // el path.
      const url = request.nextUrl.clone()
      url.pathname = '/vuelos-baratos'
      return NextResponse.rewrite(url)
    }
    if (!isPublicPath && !pathname.startsWith('/api/vuelos-baratos') && !pathname.startsWith('/_next')) {
      return NextResponse.redirect(new URL('/vuelos-baratos', request.url), 307)
    }
  }
  if (isPublicPath) return NextResponse.next({ request })

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

  // For logged-in users, get their role for redirects
  if (user && !isApiRoute) {
    // Get user's role from profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const userRole = (profile?.role || 'producto') as UserRole
    const homePage = getHomePageForRole(userRole)

    // Redirect logged-in users away from auth pages to their home
    if (isAuthRoute) {
      const url = request.nextUrl.clone()
      url.pathname = homePage
      return NextResponse.redirect(url)
    }

    // Redirect root path to role-appropriate home page
    if (request.nextUrl.pathname === '/') {
      const url = request.nextUrl.clone()
      url.pathname = homePage
      return NextResponse.redirect(url)
    }

    // Check admin routes
    const isAdminRoute = ADMIN_ROUTES.some(route =>
      request.nextUrl.pathname.startsWith(route)
    )

    if (isAdminRoute && !isAdminRole(userRole)) {
      // Not admin - redirect to home with error
      const url = request.nextUrl.clone()
      url.pathname = homePage
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
          // User doesn't have access to this section - redirect to their home
          const url = request.nextUrl.clone()
          url.pathname = homePage
          url.searchParams.set('error', 'unauthorized')
          return NextResponse.redirect(url)
        }
      }
    }
  }

  return supabaseResponse
}
