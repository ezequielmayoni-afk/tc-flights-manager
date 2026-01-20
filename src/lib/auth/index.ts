import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// Available roles in the system
export type UserRole = 'admin' | 'marketing' | 'producto' | 'diseño'

// Role permissions configuration
export const ROLE_PERMISSIONS = {
  admin: {
    label: 'Administrador',
    description: 'Acceso total al sistema',
    canAccessAdmin: true,
    sections: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  },
  marketing: {
    label: 'Marketing',
    description: 'Acceso admin (todo el sistema)',
    canAccessAdmin: true,
    sections: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  },
  producto: {
    label: 'Producto',
    description: 'Todo excepto Diseño y Marketing',
    canAccessAdmin: false,
    sections: ['cupos', 'productos', 'comercial', 'rendimiento'],
  },
  diseño: {
    label: 'Diseño',
    description: 'Paquetes, SEO y Diseño',
    canAccessAdmin: false,
    sections: ['productos', 'diseño'],
  },
} as const

export interface UserWithRole {
  id: string
  email: string
  role: UserRole
  fullName: string | null
}

interface ProfileRow {
  role: UserRole
  full_name: string | null
}

/**
 * Check if a role has admin-level access
 */
export function isAdminRole(role: UserRole): boolean {
  return role === 'admin' || role === 'marketing'
}

/**
 * Check if a role can access a specific section
 */
export function canAccessSection(role: UserRole, section: string): boolean {
  const permissions = ROLE_PERMISSIONS[role]
  return (permissions?.sections as readonly string[]).includes(section) || false
}

/**
 * Get the current user with their role from the profile
 * Returns null if not authenticated
 */
export async function getUserWithRole(): Promise<UserWithRole | null> {
  const supabase = await createClient()

  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return null
  }

  // Get the user's profile with role
  const { data, error: profileError } = await supabase
    .from('profiles')
    .select('role, full_name')
    .eq('id', user.id)
    .single()

  const profile = data as ProfileRow | null

  if (profileError || !profile) {
    // If no profile exists, default to 'producto' role (most restricted)
    return {
      id: user.id,
      email: user.email || '',
      role: 'producto',
      fullName: null,
    }
  }

  return {
    id: user.id,
    email: user.email || '',
    role: profile.role,
    fullName: profile.full_name,
  }
}

/**
 * Require authentication - redirects to login if not authenticated
 */
export async function requireAuth(): Promise<UserWithRole> {
  const user = await getUserWithRole()

  if (!user) {
    redirect('/login')
  }

  return user
}

/**
 * Require a specific role - redirects to dashboard with error if not authorized
 */
export async function requireRole(requiredRole: UserRole): Promise<UserWithRole> {
  const user = await requireAuth()

  if (user.role !== requiredRole && !isAdminRole(user.role)) {
    // Admin roles can access everything, otherwise check exact role
    redirect('/dashboard?error=unauthorized')
  }

  return user
}

/**
 * Require admin role (admin or marketing)
 */
export async function requireAdmin(): Promise<UserWithRole> {
  const user = await requireAuth()

  if (!isAdminRole(user.role)) {
    redirect('/dashboard?error=unauthorized')
  }

  return user
}

/**
 * Check if user has a specific role (for API routes)
 */
export async function checkRole(requiredRole: UserRole): Promise<{ authorized: boolean; user: UserWithRole | null }> {
  const user = await getUserWithRole()

  if (!user) {
    return { authorized: false, user: null }
  }

  // Admin roles can access everything
  if (isAdminRole(user.role)) {
    return { authorized: true, user }
  }

  return { authorized: user.role === requiredRole, user }
}

/**
 * Check if user is admin (admin or marketing) for API routes
 */
export async function checkAdmin(): Promise<{ authorized: boolean; user: UserWithRole | null }> {
  const user = await getUserWithRole()

  if (!user) {
    return { authorized: false, user: null }
  }

  return { authorized: isAdminRole(user.role), user }
}

/**
 * Check if user can access a specific section
 */
export async function checkSectionAccess(section: string): Promise<{ authorized: boolean; user: UserWithRole | null }> {
  const user = await getUserWithRole()

  if (!user) {
    return { authorized: false, user: null }
  }

  return { authorized: canAccessSection(user.role, section), user }
}
