import { createClient } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * GET /api/ai/prompt
 * Get the current AI prompt for creative generation
 */
export async function GET() {
  const db = getSupabaseClient()

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
  const db = getSupabaseClient()

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
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error saving prompt' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
