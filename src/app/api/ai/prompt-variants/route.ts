/**
 * API Route: Prompt Variants Management
 *
 * GET - Retrieve all active prompt variants
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

    if (!variant_number || variant_number < 1 || variant_number > 5) {
      return NextResponse.json(
        { error: 'variant_number must be between 1 and 5' },
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
