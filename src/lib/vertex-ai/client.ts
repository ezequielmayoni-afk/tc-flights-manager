/**
 * Vertex AI Client for Gemini (text) and Imagen 3 (images)
 * Uses the same service account as Google Drive
 */

import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import type {
  AICreativeOutput,
  AICreativeVariant,
  PackageDataForAI,
} from '@/types/ai-creatives'

// Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
const GEMINI_MODEL = 'gemini-2.0-flash-001' // Latest model, faster and cheaper
const IMAGEN_MODEL = 'imagen-3.0-generate-001'

/**
 * Get authenticated client using service account
 */
function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)

  const auth = new google.auth.JWT({
    email: credentials.client_email,
    key: credentials.private_key,
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  })

  return auth
}

/**
 * Get access token for API calls
 */
async function getAccessToken(): Promise<string> {
  const auth = getAuth()
  const { token } = await auth.getAccessToken()
  if (!token) throw new Error('Failed to get access token')
  return token
}

/**
 * Get the master prompt from database, falling back to default if not set
 */
async function getMasterPrompt(): Promise<string> {
  try {
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data, error } = await db
      .from('ai_settings')
      .select('value')
      .eq('key', 'master_prompt')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.warn('[Vertex AI] Error fetching prompt from DB, using default:', error.message)
    }

    if (data?.value) {
      console.log('[Vertex AI] Using custom prompt from database')
      return data.value
    }

    console.log('[Vertex AI] Using default prompt')
    return DEFAULT_MASTER_PROMPT
  } catch (error) {
    console.warn('[Vertex AI] Error fetching prompt, using default:', error)
    return DEFAULT_MASTER_PROMPT
  }
}

/**
 * Variant configurations for per-variant generation
 */
export const VARIANT_CONFIGS = {
  1: { key: 'variante_1_precio', name: 'Precio / Oferta', description: 'Urgencia, oferta, "aprovechá ahora"' },
  2: { key: 'variante_2_experiencia', name: 'Experiencia', description: 'Emocional, aspiracional, escaparse' },
  3: { key: 'variante_3_destino', name: 'Destino', description: 'El lugar es protagonista, paisaje icónico' },
  4: { key: 'variante_4_conveniencia', name: 'Conveniencia', description: 'Todo resuelto, cero estrés' },
  5: { key: 'variante_5_escasez', name: 'Escasez', description: 'Últimos lugares, decisión inmediata' },
} as const

/**
 * Single variant prompt template
 */
const SINGLE_VARIANT_PROMPT = `PROMPT: GENERACIÓN DE CREATIVE PARA ADS "SÍ, VIAJO"

ROL: Eres el Director de Arte de "Sí, Viajo". Creas anuncios de alto rendimiento donde TODO EL TEXTO VA SOBRE LA IMAGEN.

DATOS DEL PAQUETE:
{{PACKAGE_JSON}}

REGLAS VISUALES:
- Colores: Azul #1A237E (fondo), Verde #1DE9B6 (precio/CTA)
- Tipografía: Montserrat Bold Italic
- Fotos: Luminosas, con sol, personas disfrutando
- El precio debe ser el elemento más visible

CONTEXTO DEL DESTINO:
La imagen debe representar fielmente el destino (playas caribeñas, montañas, ciudades europeas, etc.)

DATOS OBLIGATORIOS:
- Precio: usar current_price_per_pax redondeado hacia abajo con moneda
- Fecha: formatear como "Mes Año"
- Si es ALL INCLUSIVE o incluye vuelo, destacarlo

GENERA LA VARIANTE: {{VARIANT_NAME}}
Enfoque: {{VARIANT_DESCRIPTION}}

FORMATOS REQUERIDOS:
- formato_1080: Imagen 1080x1080 (1:1) para Feed
- formato_1920: Imagen 1920x1080 (16:9) para Stories/Reels

RESPONDE ÚNICAMENTE CON JSON VÁLIDO:
{
  "concepto": "{{VARIANT_NAME}}",
  "formato_1080": {
    "titulo_principal": "string",
    "subtitulo": "string",
    "precio_texto": "string (ej: USD 1234)",
    "cta": "string",
    "descripcion_imagen": "string EN INGLÉS (50-100 palabras para Imagen 3)",
    "estilo": "string"
  },
  "formato_1920": {
    "titulo_principal": "string",
    "subtitulo": "string",
    "precio_texto": "string",
    "cta": "string",
    "descripcion_imagen": "string EN INGLÉS (50-100 palabras para Imagen 3)",
    "estilo": "string"
  },
  "metadata": {
    "destino": "string",
    "fecha_salida": "string",
    "precio_base": number,
    "currency": "string",
    "noches": number,
    "regimen": "string o null"
  }
}

IMPORTANTE para descripcion_imagen:
- Escribir EN INGLÉS para generación con IA
- 50-100 palabras, estilo técnico publicitario
- Incluir: tipo de foto, composición, personas, luz, colores, mood
`

/**
 * Single variant response from Gemini
 */
export interface SingleVariantOutput {
  concepto: string
  formato_1080: {
    titulo_principal: string
    subtitulo: string
    precio_texto: string
    cta: string
    descripcion_imagen: string
    estilo: string
  }
  formato_1920: {
    titulo_principal: string
    subtitulo: string
    precio_texto: string
    cta: string
    descripcion_imagen: string
    estilo: string
  }
  metadata: {
    destino: string
    fecha_salida: string
    precio_base: number
    currency: string
    noches: number
    regimen: string | null
  }
}

/**
 * Call Gemini API to generate a SINGLE variant
 * This allows sequential processing: generate → images → upload → next variant
 */
export async function generateSingleVariantWithGemini(
  packageData: PackageDataForAI,
  variantNumber: 1 | 2 | 3 | 4 | 5
): Promise<SingleVariantOutput> {
  const token = await getAccessToken()
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`

  const config = VARIANT_CONFIGS[variantNumber]

  // Build prompt for single variant
  const prompt = SINGLE_VARIANT_PROMPT
    .replace('{{PACKAGE_JSON}}', JSON.stringify(packageData, null, 2))
    .replace(/{{VARIANT_NAME}}/g, config.name)
    .replace('{{VARIANT_DESCRIPTION}}', config.description)

  console.log(`[Vertex AI] Generating variant ${variantNumber} (${config.name}) for package ${packageData.tc_package_id}`)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`[Vertex AI] Gemini error for variant ${variantNumber}:`, errorText)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log(`[Vertex AI] Variant ${variantNumber} response received`)

  const content = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) {
    throw new Error('No content in Gemini response')
  }

  // Parse JSON response
  try {
    let cleanContent = content.trim()
    if (cleanContent.startsWith('```json')) cleanContent = cleanContent.slice(7)
    else if (cleanContent.startsWith('```')) cleanContent = cleanContent.slice(3)
    if (cleanContent.endsWith('```')) cleanContent = cleanContent.slice(0, -3)
    cleanContent = cleanContent.trim()

    return JSON.parse(cleanContent) as SingleVariantOutput
  } catch {
    console.error(`[Vertex AI] Failed to parse variant ${variantNumber} response:`, content.slice(0, 200))
    throw new Error(`Failed to parse Gemini response for variant ${variantNumber}`)
  }
}

/**
 * Legacy: Generate all 5 variants at once (kept for backwards compatibility)
 * @deprecated Use generateSingleVariantWithGemini for sequential processing
 */
export async function generateCreativesWithGemini(
  packageData: PackageDataForAI
): Promise<AICreativeOutput> {
  // Generate all 5 variants sequentially and combine
  const results: Partial<AICreativeOutput> = { metadata: undefined }

  for (const num of [1, 2, 3, 4, 5] as const) {
    const config = VARIANT_CONFIGS[num]
    const variant = await generateSingleVariantWithGemini(packageData, num)

    // Map to output structure
    results[config.key as keyof AICreativeOutput] = {
      concepto: variant.concepto,
      formato_1080: variant.formato_1080,
      formato_1920: variant.formato_1920,
    } as AICreativeVariant

    // Use metadata from first variant
    if (!results.metadata && variant.metadata) {
      results.metadata = variant.metadata
    }
  }

  return results as AICreativeOutput
}

/**
 * Generate image using Imagen 3
 */
export async function generateImageWithImagen(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:5' = '1:1'
): Promise<string> {
  const token = await getAccessToken()
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${IMAGEN_MODEL}:predict`

  console.log('[Vertex AI] Generating image with Imagen 3...')
  console.log('[Vertex AI] Aspect ratio:', aspectRatio)

  // Map aspect ratio to Imagen format
  const imagenAspectRatio = aspectRatio

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [
        {
          prompt: prompt,
        },
      ],
      parameters: {
        sampleCount: 1,
        aspectRatio: imagenAspectRatio,
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_adult',
        outputOptions: {
          mimeType: 'image/png',
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Vertex AI] Imagen error:', errorText)
    throw new Error(`Imagen API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()

  // Extract base64 image
  const imageData = result.predictions?.[0]?.bytesBase64Encoded
  if (!imageData) {
    throw new Error('No image data in Imagen response')
  }

  console.log('[Vertex AI] Image generated successfully')
  return imageData // Returns base64 encoded PNG
}

/**
 * Generate all images for a creative variant (new dual-format structure)
 */
export async function generateVariantImages(
  variant: AICreativeVariant,
  variantNumber: number
): Promise<{ aspectRatio: '1080' | '1920'; base64: string }[]> {
  const images: { aspectRatio: '1080' | '1920'; base64: string }[] = []

  // Generate 1080x1080 (1:1) image for Feed
  try {
    console.log(`[Vertex AI] Generating 1080x1080 image for variant ${variantNumber}...`)
    const image1080 = await generateImageWithImagen(variant.formato_1080.descripcion_imagen, '1:1')
    images.push({ aspectRatio: '1080', base64: image1080 })
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 1080x1080 for variant ${variantNumber}:`, error)
  }

  // Generate 1920x1080 (16:9) image for Stories/Reels
  try {
    console.log(`[Vertex AI] Generating 1920x1080 image for variant ${variantNumber}...`)
    const image1920 = await generateImageWithImagen(variant.formato_1920.descripcion_imagen, '16:9')
    images.push({ aspectRatio: '1920', base64: image1920 })
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 1920x1080 for variant ${variantNumber}:`, error)
  }

  return images
}

/**
 * Validate configuration
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  if (!process.env.GOOGLE_CLOUD_PROJECT_ID) {
    errors.push('GOOGLE_CLOUD_PROJECT_ID is not set')
  }

  if (!process.env.GOOGLE_DRIVE_CREDENTIALS) {
    errors.push('GOOGLE_DRIVE_CREDENTIALS is not set (needed for auth)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
