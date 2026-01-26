/**
 * API Route: Prompt Variants Management
 *
 * GET - Retrieve all prompt variants
 * POST - Create a new prompt variant
 * PUT - Update an existing prompt variant
 * DELETE - Delete a prompt variant
 */

import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/ai/prompt-variants
 *
 * Get all prompt variants (the 5 creative variants with "Sí" hooks)
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const activeOnly = searchParams.get('activeOnly') !== 'false'

  try {
    let query = db
      .from('ai_prompt_variants')
      .select('*')
      .order('variant_number')

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data: variants, error } = await query

    if (error) {
      throw error
    }

    return NextResponse.json({
      variants: variants || [],
      count: variants?.length || 0,
    })

  } catch (error) {
    console.error('[Prompt Variants API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/ai/prompt-variants
 *
 * Update a prompt variant
 *
 * Body:
 * - variant_number: number (required)
 * - name: string
 * - focus: string
 * - description_es: string
 * - visual_direction: string
 * - hook_phrases: string[]
 * - prompt_addition: string
 * - is_active: boolean
 */
export async function PUT(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { variant_number, ...updates } = body

    if (!variant_number || variant_number < 1) {
      return NextResponse.json(
        { error: 'variant_number must be >= 1' },
        { status: 400 }
      )
    }

    const { data, error } = await db
      .from('ai_prompt_variants')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('variant_number', variant_number)
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`[Prompt Variants API] Variant ${variant_number} updated`)

    return NextResponse.json({
      success: true,
      variant: data,
    })

  } catch (error) {
    console.error('[Prompt Variants API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ai/prompt-variants
 *
 * Create a new prompt variant
 *
 * Body:
 * - name: string (required)
 * - focus: string (required)
 * - description_es: string (required)
 * - visual_direction: string (required)
 * - hook_phrases: string[] (required)
 * - prompt_addition: string (required)
 * - is_active: boolean (optional, default true)
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { name, focus, description_es, visual_direction, hook_phrases, prompt_addition, is_active = true } = body

    // Validate required fields
    if (!name || !focus || !description_es || !visual_direction || !hook_phrases || !prompt_addition) {
      return NextResponse.json(
        { error: 'Missing required fields: name, focus, description_es, visual_direction, hook_phrases, prompt_addition' },
        { status: 400 }
      )
    }

    // Get the next variant number
    const { data: maxVariant } = await db
      .from('ai_prompt_variants')
      .select('variant_number')
      .order('variant_number', { ascending: false })
      .limit(1)
      .single()

    const nextVariantNumber = (maxVariant?.variant_number || 0) + 1

    const { data, error } = await db
      .from('ai_prompt_variants')
      .insert({
        variant_number: nextVariantNumber,
        name,
        focus,
        description_es,
        visual_direction,
        hook_phrases: Array.isArray(hook_phrases) ? hook_phrases : [hook_phrases],
        prompt_addition,
        is_active,
      })
      .select()
      .single()

    if (error) {
      throw error
    }

    console.log(`[Prompt Variants API] Variant ${nextVariantNumber} created: ${name}`)

    return NextResponse.json({
      success: true,
      variant: data,
    })

  } catch (error) {
    console.error('[Prompt Variants API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ai/prompt-variants
 *
 * Delete a prompt variant
 *
 * Query params:
 * - variant_number: number (required)
 */
export async function DELETE(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const variantNumber = searchParams.get('variant_number')

  if (!variantNumber) {
    return NextResponse.json(
      { error: 'variant_number query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const { error } = await db
      .from('ai_prompt_variants')
      .delete()
      .eq('variant_number', parseInt(variantNumber))

    if (error) {
      throw error
    }

    console.log(`[Prompt Variants API] Variant ${variantNumber} deleted`)

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Prompt Variants API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
