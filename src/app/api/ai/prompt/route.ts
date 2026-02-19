import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * GET /api/ai/prompt
 * Get the current AI prompt for creative generation
 */
export async function GET() {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    // Get the prompt from ai_settings table
    const { data, error } = await db
      .from('ai_settings')
      .select('value')
      .eq('key', 'master_prompt')
      .single()

    if (error && error.code !== 'PGRST116') {
      // PGRST116 = not found, which is ok
      console.error('[AI Prompt GET] Error:', error)
    }

    return new Response(
      JSON.stringify({ prompt: data?.value || null }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[AI Prompt GET] Error:', error)
    return new Response(
      JSON.stringify({ prompt: null }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  }
}

/**
 * POST /api/ai/prompt
 * Save the AI prompt for creative generation
 */
export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  const db = createAdminClient()

  try {
    const { prompt } = await request.json()

    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    }

    // Upsert the prompt in ai_settings table
    const { error } = await db
      .from('ai_settings')
      .upsert(
        {
          key: 'master_prompt',
          value: prompt,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'key' }
      )

    if (error) {
      console.error('[AI Prompt POST] Error:', error)
      throw error
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[AI Prompt POST] Error:', error)
    return errorResponse(error)
  }
}
