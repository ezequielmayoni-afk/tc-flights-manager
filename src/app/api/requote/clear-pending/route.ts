import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/requote/clear-pending
 * Clear all pending packages (mark as completed) so only newly selected ones are processed
 */
export async function POST() {
  const db = getSupabaseClient()

  try {
    const { data, error } = await db
      .from('packages')
      .update({ requote_status: 'completed' })
      .eq('requote_status', 'pending')
      .select('id')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      cleared: data?.length || 0,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
