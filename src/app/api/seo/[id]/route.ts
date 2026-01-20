import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/seo/[id]
 * Update SEO fields for a specific package
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id } = await params
  const db = getSupabaseClient()

  try {
    const body = await request.json()

    // Validate allowed fields
    const allowedFields = [
      'seo_title',
      'seo_description',
      'seo_keywords',
      'meta_title',
      'meta_description',
      'image_alt',
      'include_sitemap',
      'seo_uploaded_to_tc',
    ]

    const updateData: Record<string, unknown> = {}
    for (const field of allowedFields) {
      if (field in body) {
        updateData[field] = body[field]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data, error } = await db
      .from('packages')
      .update(updateData)
      .eq('id', id)
      .select('id, tc_package_id, title, seo_title, seo_description, seo_keywords, meta_title, meta_description, image_alt, include_sitemap, seo_status')
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('[SEO Update] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
