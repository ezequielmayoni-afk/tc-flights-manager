import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/seo/config
 * Get the current prompt configuration
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('seo')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { data, error } = await db
      .from('seo_prompt_config')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      return errorResponse(error)
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[SEO Config GET] Error:', error)
    return errorResponse(error)
  }
}

/**
 * PUT /api/seo/config
 * Update the prompt configuration
 */
export async function PUT(request: NextRequest) {
  const { authorized } = await checkSectionAccess('seo')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { prompt_template } = await request.json()

    if (!prompt_template || typeof prompt_template !== 'string') {
      return NextResponse.json({ error: 'Invalid prompt template' }, { status: 400 })
    }

    // Get current config
    const { data: existing } = await db
      .from('seo_prompt_config')
      .select('id')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    let result
    if (existing) {
      // Update existing
      result = await db
        .from('seo_prompt_config')
        .update({
          prompt_template,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
    } else {
      // Insert new
      result = await db
        .from('seo_prompt_config')
        .insert({ prompt_template })
        .select()
        .single()
    }

    if (result.error) {
      return errorResponse(result.error)
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error('[SEO Config PUT] Error:', error)
    return errorResponse(error)
  }
}
