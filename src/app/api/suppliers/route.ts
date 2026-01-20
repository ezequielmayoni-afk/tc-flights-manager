import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/suppliers
 * Get all suppliers from the database
 */
export async function GET() {
  try {
    const db = getSupabaseClient()

    const { data: suppliers, error } = await db
      .from('suppliers')
      .select('id, name')
      .order('name')

    if (error) {
      throw error
    }

    return NextResponse.json({ suppliers: suppliers || [] })
  } catch (error) {
    console.error('[Suppliers GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
