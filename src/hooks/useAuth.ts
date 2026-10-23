'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'

export type UserRole = 'admin' | 'marketing' | 'producto' | 'diseño' | 'ventas' | 'aereos'

// Role permissions configuration (must match server-side config)
export const ROLE_PERMISSIONS = {
  admin: {
    label: 'Administrador',
    canAccessAdmin: true,
    readOnly: false,
    sections: ['cupos', 'aereos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users', 'seo', 'requote'],
  },
  marketing: {
    label: 'Marketing',
    canAccessAdmin: true,
    readOnly: false,
    sections: ['cupos', 'aereos', 'productos', 'diseño', 'marketing', 'comercial', 'rendimiento', 'users', 'seo', 'requote'],
  },
  producto: {
    label: 'Producto',
    canAccessAdmin: false,
    readOnly: false,
    sections: ['cupos', 'aereos', 'productos', 'comercial', 'rendimiento', 'seo', 'requote'],
  },
  diseño: {
    label: 'Diseño',
    canAccessAdmin: false,
    readOnly: false,
    sections: ['productos', 'diseño', 'seo'],
  },
  aereos: {
    label: 'Aéreos',
    canAccessAdmin: false,
    readOnly: false,
    sections: ['aereos'],
  },
  ventas: {
    label: 'Ventas',
    canAccessAdmin: false,
    readOnly: true,
    sections: ['productos', 'comercial'],
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
  isReadOnly: boolean
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

    // Listen for auth changes.
    // OJO: este callback corre mientras supabase-js tiene tomado el lock de la sesión. Si adentro se
    // espera otra llamada a Supabase (la consulta de `profiles`), esa llamada espera el lock y el lock
    // espera al callback: se traba todo el cliente del navegador (el menú queda vacío y las tablas
    // cargando). Pasaba al refrescar con el token por vencer (evento TOKEN_REFRESHED). Por eso el
    // trabajo se difiere con setTimeout y las renovaciones de token del mismo usuario se ignoran.
    let lastUserId: string | null | undefined
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const nextId = session?.user?.id ?? null
        if (event === 'TOKEN_REFRESHED' && nextId === lastUserId) return
        lastUserId = nextId
        setTimeout(() => { void fetchUserWithRole(session?.user || null) }, 0)
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [supabase, fetchUserWithRole])

  // Check if user has admin-level access (admin or marketing)
  const isAdmin = user?.role === 'admin' || user?.role === 'marketing'

  // Check if user has read-only access
  const isReadOnly = user ? ROLE_PERMISSIONS[user.role]?.readOnly || false : false

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
    isReadOnly,
    isAuthenticated: !!user,
    canAccessSection,
    refresh,
  }
}
