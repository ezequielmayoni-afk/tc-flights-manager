'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'marketing' | 'producto' | 'diseño'

// Role permissions configuration (must match server-side config)
export const ROLE_PERMISSIONS = {
  admin: {
    label: 'Administrador',
    canAccessAdmin: true,
    sections: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  },
  marketing: {
    label: 'Marketing',
    canAccessAdmin: true,
    sections: ['cupos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users'],
  },
  producto: {
    label: 'Producto',
    canAccessAdmin: false,
    sections: ['cupos', 'productos', 'comercial', 'rendimiento'],
  },
  diseño: {
    label: 'Diseño',
    canAccessAdmin: false,
    sections: ['productos', 'diseño'],
  },
} as const

export interface AuthUser {
  id: string
  email: string
  role: UserRole
  fullName: string | null
}

interface UseAuthReturn {
  user: AuthUser | null
  loading: boolean
  isAdmin: boolean
  isAuthenticated: boolean
  canAccessSection: (section: string) => boolean
  refresh: () => Promise<void>
}

interface ProfileRow {
  role: UserRole
  full_name: string | null
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  const fetchUserWithRole = useCallback(async (authUser: User | null) => {
    if (!authUser) {
      setUser(null)
      setLoading(false)
      return
    }

    try {
      // Get the user's profile with role
      const { data, error } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', authUser.id)
        .single()

      const profile = data as ProfileRow | null

      if (error || !profile) {
        // If no profile exists, default to 'producto' role (most restricted)
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          role: 'producto',
          fullName: null,
        })
      } else {
        setUser({
          id: authUser.id,
          email: authUser.email || '',
          role: profile.role,
          fullName: profile.full_name,
        })
      }
    } catch {
      setUser(null)
    } finally {
      setLoading(false)
    }
  }, [supabase])

  const refresh = useCallback(async () => {
    setLoading(true)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    await fetchUserWithRole(authUser)
  }, [supabase, fetchUserWithRole])

  useEffect(() => {
    // Initial fetch
    const init = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      await fetchUserWithRole(authUser)
    }
    init()

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_, session) => {
        await fetchUserWithRole(session?.user || null)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchUserWithRole])

  // Check if user has admin-level access (admin or marketing)
  const isAdmin = user?.role === 'admin' || user?.role === 'marketing'

  // Check if user can access a specific section
  const canAccessSection = useCallback((section: string): boolean => {
    if (!user) return false
    const permissions = ROLE_PERMISSIONS[user.role]
    return (permissions?.sections as readonly string[]).includes(section) || false
  }, [user])

  return {
    user,
    loading,
    isAdmin,
    isAuthenticated: !!user,
    canAccessSection,
    refresh,
  }
}
