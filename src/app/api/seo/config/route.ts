import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/seo/config
 * Get the current prompt configuration
 */
export async function GET() {
  const db = getSupabaseClient()

  try {
    const { data, error } = await db
      .from('seo_prompt_config')
      .select('*')
      .order('id', { ascending: false })
      .limit(1)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch (error) {
    console.error('[SEO Config GET] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/seo/config
 * Update the prompt configuration
 */
export async function PUT(request: NextRequest) {
  const db = getSupabaseClient()

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
      return NextResponse.json({ error: result.error.message }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      data: result.data,
    })
  } catch (error) {
    console.error('[SEO Config PUT] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
