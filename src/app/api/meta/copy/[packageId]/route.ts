import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/copy/[packageId]
 * Get all copy variants for a package
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const db = getSupabaseClient()
  const { packageId } = await params

  try {
    const { data: copies, error } = await db
      .from('meta_ad_copies')
      .select('*')
      .eq('package_id', parseInt(packageId))
      .order('variant')

    if (error) {
      throw error
    }

    return NextResponse.json({ copies })
  } catch (error) {
    console.error('[Meta Copy GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching copies' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/meta/copy/[packageId]
 * Update a copy variant
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const db = getSupabaseClient()
  const { packageId } = await params

  try {
    const body = await request.json()
    const { variant, headline, primary_text, description, wa_message_template, approved } = body

    if (!variant) {
      return NextResponse.json(
        { error: 'variant is required' },
        { status: 400 }
      )
    }

    const updateData: Record<string, unknown> = {}
    if (headline !== undefined) updateData.headline = headline
    if (primary_text !== undefined) updateData.primary_text = primary_text
    if (description !== undefined) updateData.description = description
    if (wa_message_template !== undefined) updateData.wa_message_template = wa_message_template
    if (approved !== undefined) {
      updateData.approved = approved
      if (approved) {
        updateData.approved_at = new Date().toISOString()
      }
    }
    updateData.generated_by = 'manual'

    const { data, error } = await db
      .from('meta_ad_copies')
      .update(updateData)
      .eq('package_id', parseInt(packageId))
      .eq('variant', variant)
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true, copy: data })
  } catch (error) {
    console.error('[Meta Copy PUT] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error updating copy' },
      { status: 500 }
    )
  }
}
