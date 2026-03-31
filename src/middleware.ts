import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - api/creatives/upload (large file uploads - proxy truncates body to 10MB)
     */
    '/((?!_next/static|_next/image|favicon.ico|api/creatives/upload|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
