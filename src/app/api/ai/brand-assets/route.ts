/**
 * API Route: Brand Assets Management
 *
 * GET - Retrieve all brand assets
 * POST - Create/update a brand asset
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
 * GET /api/ai/brand-assets
 *
 * Get all brand assets or a specific one by key
 */
export async function GET(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  try {
    if (key) {
      // Get specific asset
      const { data, error } = await db
        .from('ai_brand_assets')
        .select('*')
        .eq('key', key)
        .single()

      if (error && error.code !== 'PGRST116') {
        throw error
      }

      return NextResponse.json({ asset: data || null })
    }

    // Get all assets
    const { data: assets, error } = await db
      .from('ai_brand_assets')
      .select('*')
      .order('key')

    if (error) {
      throw error
    }

    // Transform to object for easier access
    const assetsObject: Record<string, {
      value: string
      content_type: string | null
      description: string | null
      updated_at: string
    }> = {}

    for (const asset of assets || []) {
      assetsObject[asset.key] = {
        value: asset.value,
        content_type: asset.content_type,
        description: asset.description,
        updated_at: asset.updated_at,
      }
    }

    return NextResponse.json({
      assets: assetsObject,
      count: assets?.length || 0,
    })

  } catch (error) {
    console.error('[Brand Assets API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/ai/brand-assets
 *
 * Create or update a brand asset
 *
 * Body:
 * - key: string (required) - Asset key (manual_marca, logo_base64, analisis_estilo)
 * - value: string (required) - Asset content
 * - content_type: string (optional) - MIME type
 * - description: string (optional) - Description
 */
export async function POST(request: NextRequest) {
  const db = getSupabaseClient()

  try {
    const body = await request.json()
    const { key, value, content_type, description } = body

    if (!key) {
      return NextResponse.json(
        { error: 'key is required' },
        { status: 400 }
      )
    }

    if (value === undefined) {
      return NextResponse.json(
        { error: 'value is required' },
        { status: 400 }
      )
    }

    // Validate key
    const validKeys = ['manual_marca', 'logo_base64', 'analisis_estilo']
    if (!validKeys.includes(key)) {
      return NextResponse.json(
        { error: `Invalid key. Must be one of: ${validKeys.join(', ')}` },
        { status: 400 }
      )
    }

    const contentTypeValue = content_type || (key === 'logo_base64' ? 'image/png' : 'text/markdown')

    // First, check if the row exists
    const { data: existing } = await db
      .from('ai_brand_assets')
      .select('id')
      .eq('key', key)
      .single()

    let data
    let error

    if (existing) {
      // Update existing row
      const result = await db
        .from('ai_brand_assets')
        .update({
          value,
          content_type: contentTypeValue,
          description: description || null,
          updated_at: new Date().toISOString(),
        })
        .eq('key', key)
        .select()
        .single()

      data = result.data
      error = result.error
    } else {
      // Insert new row
      const result = await db
        .from('ai_brand_assets')
        .insert({
          key,
          value,
          content_type: contentTypeValue,
          description: description || null,
        })
        .select()
        .single()

      data = result.data
      error = result.error
    }

    if (error) {
      console.error('[Brand Assets API] DB Error:', error)
      throw error
    }

    console.log(`[Brand Assets API] Asset "${key}" saved (${value.length} chars)`)

    return NextResponse.json({
      success: true,
      asset: data,
    })

  } catch (error) {
    console.error('[Brand Assets API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/ai/brand-assets
 *
 * Clear a brand asset (set value to empty string)
 */
export async function DELETE(request: NextRequest) {
  const db = getSupabaseClient()
  const { searchParams } = new URL(request.url)
  const key = searchParams.get('key')

  if (!key) {
    return NextResponse.json(
      { error: 'key query parameter is required' },
      { status: 400 }
    )
  }

  try {
    const { error } = await db
      .from('ai_brand_assets')
      .update({ value: '', updated_at: new Date().toISOString() })
      .eq('key', key)

    if (error) {
      throw error
    }

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('[Brand Assets API] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
