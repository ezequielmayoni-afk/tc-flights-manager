import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkAdmin, UserRole, ROLE_PERMISSIONS } from '@/lib/auth'

interface ProfileRow {
  id: string
  full_name: string | null
  role: UserRole
  created_at: string
  updated_at: string
}

// POST /api/users - Create a new user
export async function POST(request: NextRequest) {
  try {
    const { authorized } = await checkAdmin()

    if (!authorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const { email, password, full_name, role } = body

    // Validate required fields
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email y contraseña son requeridos' },
        { status: 400 }
      )
    }

    // Validate role
    const validRoles: UserRole[] = ['admin', 'marketing', 'producto', 'diseño', 'ventas']
    if (role && !validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Rol inválido' },
        { status: 400 }
      )
    }

    // Create user with admin client (service role)
    const adminClient = createAdminClient()

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: {
        full_name: full_name || null,
      },
    })

    if (authError || !authData.user) {
      console.error('[Users API] Error creating auth user:', authError)

      // Handle specific errors
      if (authError?.message?.includes('already registered')) {
        return NextResponse.json(
          { error: 'El email ya está registrado' },
          { status: 400 }
        )
      }

      return NextResponse.json(
        { error: 'Error al crear usuario' },
        { status: 500 }
      )
    }

    // Update the profile with role and name
    // Note: Profile is auto-created by trigger, we just need to update it
    const { error: profileError } = await adminClient
      .from('profiles')
      .update({
        role: role || 'producto', // Default to most restricted role
        full_name: full_name || null,
      })
      .eq('id', authData.user.id)

    if (profileError) {
      console.error('[Users API] Error updating profile:', profileError)
      // User was created but profile update failed - still return success with warning
    }

    return NextResponse.json({
      user: {
        id: authData.user.id,
        email: authData.user.email,
        fullName: full_name || null,
        role: role || 'producto',
      },
    }, { status: 201 })

  } catch (error) {
    console.error('[Users API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    // Check if user is admin
    const { authorized, user: currentUser } = await checkAdmin()

    if (!authorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    const supabase = await createClient()

    // Get all profiles with user info
    const { data, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    const profiles = data as ProfileRow[] | null

    if (profilesError || !profiles) {
      console.error('[Users API] Error fetching profiles:', profilesError)
      return NextResponse.json(
        { error: 'Error al obtener usuarios' },
        { status: 500 }
      )
    }

    // Map profiles to response format
    const users = profiles.map(profile => ({
      id: profile.id,
      fullName: profile.full_name,
      role: profile.role,
      createdAt: profile.created_at,
      updatedAt: profile.updated_at,
    }))

    return NextResponse.json({
      users,
      currentUserId: currentUser?.id,
    })
  } catch (error) {
    console.error('[Users API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
