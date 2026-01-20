import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * PATCH /api/meta/package
 * Update package marketing fields (expiration date, etc.)
 */
export async function PATCH(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { package_id, marketing_expiration_date } = body as {
      package_id: number
      marketing_expiration_date?: string | null
    }

    if (!package_id) {
      return new Response(JSON.stringify({ error: 'package_id is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const updateData: Record<string, unknown> = {}

    if (marketing_expiration_date !== undefined) {
      updateData.marketing_expiration_date = marketing_expiration_date
    }

    if (Object.keys(updateData).length === 0) {
      return new Response(JSON.stringify({ error: 'No fields to update' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const { error } = await db
      .from('packages')
      .update(updateData)
      .eq('id', package_id)

    if (error) {
      throw error
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[Meta Package PATCH] Error:', error)
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error updating package' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
