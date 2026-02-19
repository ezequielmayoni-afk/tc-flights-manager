import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


interface RouteParams {
  params: Promise<{ id: string }>
}

/**
 * PUT /api/seo/[id]
 * Update SEO fields for a specific package
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { authorized } = await checkSectionAccess('seo')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const { id } = await params
  const db = createAdminClient()

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
      return errorResponse(error)
    }

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error('[SEO Update] Error:', error)
    return errorResponse(error)
  }
}
