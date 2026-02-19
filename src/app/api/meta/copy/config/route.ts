import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/meta/copy/config
 * Get the active prompt template
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { data, error } = await db
      .from('meta_copy_prompt_config')
      .select('*')
      .eq('is_active', true)
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      config: data || null,
    })
  } catch (error) {
    console.error('[Meta Copy Config GET] Error:', error)
    return errorResponse(error)
  }
}

/**
 * PUT /api/meta/copy/config
 * Update or create the prompt template
 */
export async function PUT(request: NextRequest) {
  const { authorized } = await checkSectionAccess('marketing')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const body = await request.json()
    const { prompt_template } = body

    if (!prompt_template || typeof prompt_template !== 'string') {
      return NextResponse.json(
        { error: 'prompt_template is required' },
        { status: 400 }
      )
    }

    // Deactivate all existing configs
    await db
      .from('meta_copy_prompt_config')
      .update({ is_active: false })
      .eq('is_active', true)

    // Insert new config
    const { data, error } = await db
      .from('meta_copy_prompt_config')
      .insert({
        prompt_template,
        is_active: true,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    return NextResponse.json({
      success: true,
      config: data,
    })
  } catch (error) {
    console.error('[Meta Copy Config PUT] Error:', error)
    return errorResponse(error)
  }
}
