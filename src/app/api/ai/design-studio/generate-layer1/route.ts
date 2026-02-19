/**
 * POST /api/ai/design-studio/generate-layer1
 *
 * Genera SOLO la imagen de fondo (Capa 1: destino + sentimiento)
 * Sin texto, sin overlays, solo la foto base
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'

const GEMINI_MODEL = 'gemini-2.0-flash-exp-image-generation'


// Sentimientos por variante
const VARIANT_SENTIMENTS: Record<number, { mood: string; style: string }> = {
  1: { mood: 'urgente, llamativo', style: 'colores vibrantes, alto contraste' },
  2: { mood: 'emotivo, aspiracional', style: 'luz dorada, cálido, romántico' },
  3: { mood: 'aventurero, único', style: 'paisaje icónico, grandioso' },
  4: { mood: 'relajado, tranquilo', style: 'sereno, ordenado, confortable' },
  5: { mood: 'exclusivo, limitado', style: 'dramático, contraste fuerte' },
}

export async function POST(request: NextRequest) {
  const { authorized } = await checkSectionAccess('diseño')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    const body = await request.json()
    const { packageId, variant = 1 } = body

    if (!packageId) {
      return NextResponse.json(
        { error: 'packageId is required' },
        { status: 400 }
      )
    }

    // Obtener datos del paquete
    const db = createAdminClient()
    const { data: pkg, error: fetchError } = await db
      .from('packages')
      .select(`
        id,
        tc_package_id,
        package_destinations (
          destination_name
        )
      `)
      .eq('tc_package_id', packageId)
      .single()

    if (fetchError || !pkg) {
      return NextResponse.json(
        { error: `Paquete ${packageId} no encontrado` },
        { status: 404 }
      )
    }

    const destination = pkg.package_destinations?.[0]?.destination_name || 'Destino desconocido'

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY not configured' },
        { status: 500 }
      )
    }

    // Obtener sentimiento de la variante
    const sentiment = VARIANT_SENTIMENTS[variant] || VARIANT_SENTIMENTS[1]

    // Prompt simple para imagen de fondo
    const prompt = `
Professional travel photography of ${destination}.

STYLE:
- ${sentiment.style}
- ${sentiment.mood}
- High quality, sharp, professional advertising photo
- No text, no logos, no watermarks
- Aspect ratio 4:5 (portrait for Instagram)

Show the most iconic and beautiful view of ${destination}.
The image should evoke desire to travel there.
`.trim()

    console.log('[Layer1] Generating image for:', destination)
    console.log('[Layer1] Prompt:', prompt)

    // Llamar a Gemini
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ['IMAGE', 'TEXT'],
          temperature: 1.0,
        },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Layer1] Gemini error:', errorText)
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 500 }
      )
    }

    const result = await response.json()

    // Extraer imagen
    const parts = result.candidates?.[0]?.content?.parts
    if (!parts) {
      return NextResponse.json(
        { error: 'No response from Gemini' },
        { status: 500 }
      )
    }

    for (const part of parts) {
      if (part.inlineData?.data) {
        // Retornar como data URL para mostrar directamente
        const mimeType = part.inlineData.mimeType || 'image/png'
        const imageUrl = `data:${mimeType};base64,${part.inlineData.data}`

        console.log('[Layer1] Image generated successfully')

        return NextResponse.json({
          success: true,
          imageUrl,
          prompt,
          destination,
          variant,
          packageId,
        })
      }
    }

    return NextResponse.json(
      { error: 'No image in Gemini response' },
      { status: 500 }
    )
  } catch (error) {
    const message = 'Error interno del servidor'
    console.error('[Layer1] Error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
