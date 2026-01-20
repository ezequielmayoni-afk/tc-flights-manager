import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/meta/copy/config
 * Get the active prompt template
 */
export async function GET() {
  const db = getSupabaseClient()

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error fetching config' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/meta/copy/config
 * Update or create the prompt template
 */
export async function PUT(request: NextRequest) {
  const db = getSupabaseClient()

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error saving config' },
      { status: 500 }
    )
  }
}
