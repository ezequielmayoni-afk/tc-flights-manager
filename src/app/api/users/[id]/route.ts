import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkAdmin } from '@/lib/auth'

interface RouteParams {
  params: Promise<{ id: string }>
}

// GET /api/users/[id] - Get a specific user
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { authorized } = await checkAdmin()

    if (!authorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    const { id } = await params
    const supabase = await createClient()

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !profile) {
      return NextResponse.json(
        { error: 'Usuario no encontrado' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user: profile })
  } catch (error) {
    console.error('[Users API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// PUT /api/users/[id] - Update a user (role, name)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { authorized, user: currentUser } = await checkAdmin()

    if (!authorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    const { id } = await params
    const body = await request.json()
    const { role, full_name } = body

    // Prevent changing own role (to avoid locking yourself out)
    if (currentUser?.id === id && role && role !== currentUser.role) {
      return NextResponse.json(
        { error: 'No puedes cambiar tu propio rol' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Build update object
    const updateData: Record<string, string> = {}
    if (role !== undefined) updateData.role = role
    if (full_name !== undefined) updateData.full_name = full_name

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: 'No hay campos para actualizar' },
        { status: 400 }
      )
    }

    // Use type assertion for the update since the schema types may be incomplete
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profile, error } = await (supabase
      .from('profiles') as any)
      .update(updateData)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[Users API] Update error:', error)
      return NextResponse.json(
        { error: 'Error al actualizar usuario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ user: profile })
  } catch (error) {
    console.error('[Users API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[id] - Delete a user
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { authorized, user: currentUser } = await checkAdmin()

    if (!authorized) {
      return NextResponse.json(
        { error: 'No autorizado' },
        { status: 403 }
      )
    }

    const { id } = await params

    // Prevent deleting yourself
    if (currentUser?.id === id) {
      return NextResponse.json(
        { error: 'No puedes eliminarte a ti mismo' },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    // Delete from profiles (auth.users deletion requires service role)
    // The user won't be able to login anymore but their auth record remains
    // For full deletion, you'd need to use Supabase Admin API with service role key
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[Users API] Delete error:', error)
      return NextResponse.json(
        { error: 'Error al eliminar usuario' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Users API] Error:', error)
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    )
  }
}
