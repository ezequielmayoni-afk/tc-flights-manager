/**
 * Vertex AI Client for Gemini (text) and Gemini 3 Pro Image (images with text)
 * Uses the same service account as Google Drive
 *
 * V2: Now loads brand assets and variant prompts from database
 */

import { google } from 'googleapis'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type {
  AICreativeOutput,
  AICreativeVariant,
  AICreativeFormat,
  PackageDataForAI,
} from '@/types/ai-creatives'

// Configuration
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID!
const LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
const GEMINI_MODEL = 'gemini-2.0-flash-001' // For text generation
const GEMINI_IMAGE_MODEL = 'gemini-3-pro-image-preview' // For professional image generation with text

// ============================================================================
// DATABASE TYPES
// ============================================================================

export interface BrandAsset {
  key: string
  value: string
  content_type: string | null
  description: string | null
}

export interface PromptVariant {
  variant_number: number
  name: string
  focus: string
  description_es: string
  visual_direction: string
  hook_phrases: string[]
  prompt_addition: string
  is_active: boolean
}

export interface BrandAssets {
  manual_marca: string
  logo_base64: string
  analisis_estilo: string
}

// ============================================================================
// DATABASE FUNCTIONS
// ============================================================================

function getSupabaseClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * Load all brand assets from database
 */
export async function loadBrandAssets(): Promise<BrandAssets> {
  const db = getSupabaseClient()

  const { data, error } = await db
    .from('ai_brand_assets')
    .select('key, value, content_type')

  if (error) {
    console.warn('[Vertex AI] Error loading brand assets:', error.message)
    return { manual_marca: '', logo_base64: '', analisis_estilo: '' }
  }

  const assets: BrandAssets = {
    manual_marca: '',
    logo_base64: '',
    analisis_estilo: '',
  }

  for (const asset of data || []) {
    if (asset.key === 'manual_marca') assets.manual_marca = asset.value
    if (asset.key === 'logo_base64') assets.logo_base64 = asset.value
    if (asset.key === 'analisis_estilo') assets.analisis_estilo = asset.value
  }

  console.log('[Vertex AI] Brand assets loaded:', {
    manual_marca: assets.manual_marca ? `${assets.manual_marca.length} chars` : 'empty',
    logo_base64: assets.logo_base64 ? `${assets.logo_base64.length} chars` : 'empty',
    analisis_estilo: assets.analisis_estilo ? `${assets.analisis_estilo.length} chars` : 'empty',
  })

  return assets
}

/**
 * Load a specific variant prompt from database
 */
export async function loadVariantPrompt(variantNumber: number): Promise<PromptVariant | null> {
  const db = getSupabaseClient()

  const { data, error } = await db
    .from('ai_prompt_variants')
    .select('*')
    .eq('variant_number', variantNumber)
    .eq('is_active', true)
    .single()

  if (error) {
    console.warn(`[Vertex AI] Error loading variant ${variantNumber}:`, error.message)
    return null
  }

  return data as PromptVariant
}

/**
 * Load all active variant prompts from database
 */
export async function loadAllVariantPrompts(): Promise<PromptVariant[]> {
  const db = getSupabaseClient()

  const { data, error } = await db
    .from('ai_prompt_variants')
    .select('*')
    .eq('is_active', true)
    .order('variant_number')

  if (error) {
    console.warn('[Vertex AI] Error loading variant prompts:', error.message)
    return []
  }

  return data as PromptVariant[]
}

/**
 * Save a brand asset to database
 */
export async function saveBrandAsset(
  key: string,
  value: string,
  contentType: string = 'text/markdown'
): Promise<boolean> {
  const db = getSupabaseClient()

  const { error } = await db
    .from('ai_brand_assets')
    .upsert({
      key,
      value,
      content_type: contentType,
      updated_at: new Date().toISOString(),
    })

  if (error) {
    console.error('[Vertex AI] Error saving brand asset:', error.message)
    return false
  }

  return true
}

// ============================================================================
// PROMPT BUILDING
// ============================================================================

/**
 * Build the complete prompt for image generation combining all assets
 */
export function buildCompletePrompt(
  packageData: PackageDataForAI,
  variant: PromptVariant,
  assets: BrandAssets,
  aspectRatio: '4:5' | '9:16'
): string {
  const formatName = aspectRatio === '9:16' ? '1080x1920 Stories/Reels' : '1080x1350 Feed (4:5)'
  const destination = packageData.package_destinations?.[0] || packageData.title || 'destino'
  const price = Math.floor(packageData.current_price_per_pax || 0)
  const currency = packageData.currency || 'USD'
  const nights = packageData.nights_count || 0

  // Get a random hook phrase from the variant
  const hookPhrase = variant.hook_phrases[Math.floor(Math.random() * variant.hook_phrases.length)]
    .replace('{price}', String(price))
    .replace('{destination}', destination)
    .replace('{DESTINATION}', destination.toUpperCase())

  return `
═══════════════════════════════════════════════════════════════════
            PROFESSIONAL TRAVEL AD - SI, VIAJO
═══════════════════════════════════════════════════════════════════

[BRAND IDENTITY]
${assets.manual_marca || 'Brand: Si, Viajo - "Es la respuesta". Travel agency that inspires people to say YES.'}

Brand Colors:
- Primary: Navy Blue #1A237E
- Accent: Teal/Green #1DE9B6
- White: #FFFFFF

Typography: Montserrat Bold

[VISUAL STYLE GUIDE]
${assets.analisis_estilo || 'Professional travel advertising style. High saturation, luminous images, real people enjoying.'}

[PACKAGE DATA]
Destination: ${destination}
${packageData.hotel ? `Hotel: ${packageData.hotel.name}` : ''}
${packageData.hotel?.board_type ? `Regime: ${packageData.hotel.board_type} ${packageData.hotel.board_name || ''}` : ''}
Nights: ${nights}
Price: ${currency} ${price} per person
${packageData.departure_date ? `Date: ${packageData.departure_date}` : ''}
${packageData.flight ? `Flight: ${packageData.flight.company}` : ''}

[FORMAT]
Aspect Ratio: ${aspectRatio} (${formatName})

[VARIANT #${variant.variant_number}: ${variant.name}]
Focus: ${variant.focus}
Hook Phrase: "${hookPhrase}"

${variant.prompt_addition}

═══════════════════════════════════════════════════════════════════
                    GENERATION INSTRUCTIONS
═══════════════════════════════════════════════════════════════════

Generate a SINGLE scroll-stopping travel advertisement image.

CRITICAL REQUIREMENTS:
1. The word "SI" must be LARGE and prominent (this is the brand's core message)
2. Hook phrase: "${hookPhrase}" - make it impossible to miss
3. Price "${currency} ${price}" in a large teal #1DE9B6 badge
4. Destination "${destination}" clearly visible
5. Si, Viajo brand identity (colors, style)
6. This image must STOP THE SCROLL in 0.1 seconds

TEXT OVERLAY (in Spanish, render in the image):
- Main Hook: "${hookPhrase}"
- Price: "${currency} ${price}"
- Details: "${destination} - ${nights} noches"

VISUAL STYLE:
- Professional travel advertisement
- High quality, sharp, vibrant
- Brand colors: Navy #1A237E, Teal #1DE9B6, White
- ${aspectRatio === '9:16' ? 'Vertical mobile-optimized composition' : '4:5 vertical feed-optimized composition (Instagram recommended)'}

Generate the image now.
`.trim()
}

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
 * Default master prompt (used when no custom prompt is set in database)
 */
const DEFAULT_MASTER_PROMPT = `PROMPT MAESTRO: AUTOMATIZACIÓN DE ADS "SÍ, VIAJO" (V3)

ROL: Eres el Director de Arte de "Sí, Viajo". Creas anuncios de alto rendimiento donde TODO EL TEXTO VA SOBRE LA IMAGEN.

1. ENTRADA (JSON):
{{PACKAGE_JSON}}

2. REGLAS VISUALES:
- Colores: Azul #1A237E (fondo), Verde #1DE9B6 (precio/CTA)
- Tipografía: Montserrat Bold Italic
- Fotos: Luminosas, con sol, personas disfrutando
- El precio debe ser el elemento más visible

3. CONTEXTO DEL DESTINO:
La imagen debe representar fielmente el destino del JSON (playas caribeñas, montañas, ciudades europeas, etc.)

4. DATOS OBLIGATORIOS:
- Precio: usar current_price_per_pax redondeado hacia abajo con moneda
- Fecha: formatear como "Mes Año"
- Si es ALL INCLUSIVE o incluye vuelo, destacarlo

5. VARIANTES (5 enfoques):
- variante_1_precio: Urgencia, oferta, "aprovechá ahora"
- variante_2_experiencia: Emocional, aspiracional, escaparse
- variante_3_destino: El lugar es protagonista, paisaje icónico
- variante_4_conveniencia: Todo resuelto, cero estrés
- variante_5_escasez: Últimos lugares, decisión inmediata

6. FORMATOS POR VARIANTE:
Cada variante tiene DOS formatos:
- formato_1080: Imagen 1080x1080 (1:1) para Feed
- formato_1920: Imagen 1080x1920 (9:16) para Stories/Reels

RESPONDE ÚNICAMENTE CON JSON VÁLIDO.

IMPORTANTE para descripcion_imagen:
- Escribir EN INGLÉS para Imagen 3
- 50-100 palabras, estilo técnico publicitario
- Incluir: tipo de foto, composición, personas, luz, colores, mood
- CRÍTICO: DEBE incluir instrucciones de TEXTO SUPERPUESTO con título, precio y CTA visibles en la imagen`

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
- formato_1920: Imagen 1080x1920 (9:16) para Stories/Reels

RESPONDE ÚNICAMENTE CON JSON VÁLIDO:
{
  "concepto": "{{VARIANT_NAME}}",
  "formato_1080": {
    "titulo_principal": "string",
    "subtitulo": "string",
    "precio_texto": "string (ej: USD 1234)",
    "cta": "string",
    "descripcion_imagen": "string EN INGLÉS (50-100 palabras para Imagen 3, DEBE INCLUIR TEXTO SUPERPUESTO)",
    "estilo": "string"
  },
  "formato_1920": {
    "titulo_principal": "string",
    "subtitulo": "string",
    "precio_texto": "string",
    "cta": "string",
    "descripcion_imagen": "string EN INGLÉS (50-100 palabras para Imagen 3, DEBE INCLUIR TEXTO SUPERPUESTO)",
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
- CRÍTICO: La descripción DEBE incluir instrucciones para texto superpuesto en la imagen:
  * El título principal debe aparecer en la parte superior
  * El precio en grande y destacado (verde #1DE9B6)
  * El CTA como botón en la parte inferior
  * Usar tipografía bold, legible sobre la imagen
- Ejemplo: "Professional travel advertisement photo of a couple on a Caribbean beach at sunset. OVERLAY TEXT: Large bold white text 'PUNTA CANA' at top, prominent green price 'USD 1,299' in center, 'RESERVÁ AHORA' button at bottom. Warm golden lighting, turquoise water, palm trees. Aspirational luxury mood."
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
  const results: Record<string, unknown> = {}

  for (const num of [1, 2, 3, 4, 5] as const) {
    const config = VARIANT_CONFIGS[num]
    const variant = await generateSingleVariantWithGemini(packageData, num)

    // Map to output structure
    results[config.key] = {
      concepto: variant.concepto,
      formato_1080: variant.formato_1080,
      formato_1920: variant.formato_1920,
    }

    // Use metadata from first variant
    if (!results.metadata && variant.metadata) {
      results.metadata = variant.metadata
    }
  }

  return results as unknown as AICreativeOutput
}

/**
 * Generate professional marketing image with text overlay using Gemini Image models
 * Uses Gemini API (not Vertex AI) for native image generation with text rendering
 *
 * Models available:
 * - gemini-2.5-flash-image: Fast, efficient (1K resolution)
 * - gemini-3-pro-image-preview: Professional, advanced text rendering (up to 4K)
 */
export async function generateImageWithGemini3Pro(
  creativeContent: AICreativeFormat,
  aspectRatio: '1:1' | '9:16',
  destination: string
): Promise<string> {
  // Use Gemini API (not Vertex AI) for native image generation
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    console.warn('[Gemini Image] GEMINI_API_KEY not set, falling back to Imagen 3')
    return generateImageWithImagen3Fallback(creativeContent.descripcion_imagen, aspectRatio)
  }

  // Try gemini-2.5-flash-image first (more widely available)
  // Can upgrade to gemini-3-pro-image-preview when available
  const model = 'gemini-2.5-flash-image'
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  console.log(`[Gemini Image] Generating professional image with ${model}...`)
  console.log('[Gemini Image] Aspect ratio:', aspectRatio)
  console.log('[Gemini Image] Destination:', destination)

  // Build a comprehensive prompt that includes text rendering instructions
  const imagePrompt = buildImagePromptWithText(creativeContent, aspectRatio, destination)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: imagePrompt }],
        },
      ],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Gemini Image] API error:', errorText)

    // Fall back to Imagen 3 if Gemini Image fails
    console.log('[Gemini Image] Falling back to Imagen 3...')
    return generateImageWithImagen3Fallback(creativeContent.descripcion_imagen, aspectRatio)
  }

  const result = await response.json()

  // Extract base64 image from response
  const parts = result.candidates?.[0]?.content?.parts
  if (!parts || parts.length === 0) {
    console.warn('[Gemini Image] No content in response, falling back to Imagen 3')
    return generateImageWithImagen3Fallback(creativeContent.descripcion_imagen, aspectRatio)
  }

  // Find the image part in the response
  for (const part of parts) {
    if (part.inlineData?.data) {
      console.log('[Gemini Image] ✓ Professional image with text generated successfully')
      return part.inlineData.data // Returns base64 encoded image
    }
  }

  console.warn('[Gemini Image] No image data in response, falling back to Imagen 3')
  return generateImageWithImagen3Fallback(creativeContent.descripcion_imagen, aspectRatio)
}

/**
 * Fallback to Imagen 3 via Vertex AI when Gemini Image is not available
 */
async function generateImageWithImagen3Fallback(
  prompt: string,
  aspectRatio: '1:1' | '9:16'
): Promise<string> {
  const token = await getAccessToken()
  const imagenModel = 'imagen-3.0-generate-001'
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${imagenModel}:predict`

  console.log('[Imagen 3 Fallback] Generating image...')
  console.log('[Imagen 3 Fallback] Aspect ratio:', aspectRatio)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: aspectRatio,
        safetyFilterLevel: 'block_some',
        personGeneration: 'allow_adult',
        outputOptions: { mimeType: 'image/png' },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Imagen 3 Fallback] Error:', errorText)
    throw new Error(`Imagen 3 API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  const imageData = result.predictions?.[0]?.bytesBase64Encoded

  if (!imageData) {
    throw new Error('No image data in Imagen 3 response')
  }

  console.log('[Imagen 3 Fallback] ✓ Image generated successfully')
  return imageData
}

/**
 * Build a detailed prompt for Gemini 3 Pro Image that includes text rendering
 */
function buildImagePromptWithText(
  content: AICreativeFormat,
  aspectRatio: '1:1' | '9:16',
  destination: string
): string {
  const isVertical = aspectRatio === '9:16'
  const formatName = isVertical ? 'Stories/Reels (vertical 9:16)' : 'Feed (square 1:1)'

  // Extract the scene description (without text overlay instructions)
  const sceneDescription = content.descripcion_imagen

  return `Create a professional travel advertisement image for "${destination}" in ${formatName} format.

SCENE DESCRIPTION:
${sceneDescription}

REQUIRED TEXT OVERLAY (render these texts legibly in the image):
- MAIN TITLE at top: "${content.titulo_principal}" (large, bold, white text with subtle shadow)
- SUBTITLE below title: "${content.subtitulo}" (medium size, white)
- PRICE prominently displayed: "${content.precio_texto}" (very large, bold, green #1DE9B6 color, must be highly visible)
- CTA BUTTON at bottom: "${content.cta}" (green #1DE9B6 background, white bold text, pill-shaped button)

VISUAL STYLE:
- Brand colors: Deep blue #1A237E for any overlays, bright green #1DE9B6 for price and CTA
- Typography: Clean, bold sans-serif (like Montserrat Bold)
- Style: ${content.estilo}
- The image should look like a professional social media advertisement
- Text must be sharp, legible, and well-positioned
- Use subtle gradients or semi-transparent overlays behind text for readability
${isVertical ? '- Vertical composition optimized for mobile Stories viewing' : '- Square composition optimized for Instagram/Facebook Feed'}

IMPORTANT: This is a marketing asset - the text elements are CRITICAL and must be perfectly rendered and readable.`
}

/**
 * Legacy function - kept for backwards compatibility
 * @deprecated Use generateImageWithGemini3Pro for professional marketing images with text
 */
export async function generateImageWithImagen(
  prompt: string,
  aspectRatio: '1:1' | '16:9' | '9:16' | '4:5' = '1:1'
): Promise<string> {
  console.warn('[Vertex AI] generateImageWithImagen is deprecated. Use generateImageWithGemini3Pro for better text rendering.')

  // Convert aspect ratio for Gemini/Imagen compatibility
  const geminiAspectRatio: '1:1' | '9:16' = aspectRatio === '9:16' ? '9:16' : '1:1'

  return generateImageWithImagen3Fallback(prompt, geminiAspectRatio)
}

/**
 * Generate all images for a creative variant using Gemini 3 Pro Image
 * Creates professional marketing images with text overlay (título, precio, CTA)
 */
export async function generateVariantImages(
  variant: AICreativeVariant,
  variantNumber: number,
  destination: string = 'destino'
): Promise<{ aspectRatio: '1080' | '1920'; base64: string }[]> {
  const images: { aspectRatio: '1080' | '1920'; base64: string }[] = []

  // Generate 1080x1080 (1:1) image for Feed with text overlay
  try {
    console.log(`[Vertex AI] Generating 1080x1080 professional image for variant ${variantNumber} (${destination})...`)
    const image1080 = await generateImageWithGemini3Pro(
      variant.formato_1080,
      '1:1',
      destination
    )
    images.push({ aspectRatio: '1080', base64: image1080 })
    console.log(`[Vertex AI] ✓ 1080x1080 image generated with text overlay`)
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 1080x1080 for variant ${variantNumber}:`, error)
  }

  // Generate 1080x1920 (9:16) image for Stories/Reels with text overlay
  try {
    console.log(`[Vertex AI] Generating 1080x1920 professional image for variant ${variantNumber} (${destination})...`)
    const image1920 = await generateImageWithGemini3Pro(
      variant.formato_1920,
      '9:16',
      destination
    )
    images.push({ aspectRatio: '1920', base64: image1920 })
    console.log(`[Vertex AI] ✓ 1080x1920 image generated with text overlay`)
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 1080x1920 for variant ${variantNumber}:`, error)
  }

  return images
}

// ============================================================================
// NEW V2 GENERATION FUNCTIONS
// ============================================================================

/**
 * Generate a creative image using the complete prompt with brand assets
 * This is the new recommended method for generating scroll-stopping creatives
 */
export async function generateCreativeImageV2(
  packageData: PackageDataForAI,
  variantNumber: number,
  aspectRatio: '4:5' | '9:16',
  options?: {
    assets?: BrandAssets
    variant?: PromptVariant
    includeLogo?: boolean
  }
): Promise<{
  base64: string
  prompt: string
  model: string
  assetsUsed: string[]
}> {
  // Load assets if not provided
  const assets = options?.assets || await loadBrandAssets()
  const variant = options?.variant || await loadVariantPrompt(variantNumber)

  if (!variant) {
    throw new Error(`Variant ${variantNumber} not found or not active`)
  }

  // Build the complete prompt
  const prompt = buildCompletePrompt(packageData, variant, assets, aspectRatio)

  // Track which assets were used
  const assetsUsed: string[] = []
  if (assets.manual_marca) assetsUsed.push('manual_marca')
  if (assets.analisis_estilo) assetsUsed.push('analisis_estilo')
  if (assets.logo_base64 && options?.includeLogo) assetsUsed.push('logo_base64')

  console.log(`[Vertex AI V2] Generating V${variantNumber} ${aspectRatio} for ${packageData.package_destinations?.[0] || 'unknown'}`)
  console.log(`[Vertex AI V2] Assets used:`, assetsUsed)
  console.log(`[Vertex AI V2] Prompt length:`, prompt.length)

  // Use Gemini API for image generation
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const model = GEMINI_IMAGE_MODEL
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  // Build request parts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt }
  ]

  // Add logo as image reference if available and requested
  if (assets.logo_base64 && options?.includeLogo) {
    // Strip data URL prefix if present (e.g., "data:image/png;base64,")
    let logoData = assets.logo_base64
    let mimeType = 'image/png'

    if (logoData.startsWith('data:')) {
      const match = logoData.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mimeType = match[1]
        logoData = match[2]
      }
    }

    console.log(`[Vertex AI V2] Logo: ${logoData.length} chars, mime: ${mimeType}`)

    parts.push({
      inlineData: {
        mimeType,
        data: logoData,
      }
    })
    console.log('[Vertex AI V2] Logo added as reference image')
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
        temperature: 1.0,
        imageConfig: {
          aspectRatio: aspectRatio,
        },
      },
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Vertex AI V2] API error:', errorText)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()

  // Extract image from response
  const responseParts = result.candidates?.[0]?.content?.parts
  if (!responseParts || responseParts.length === 0) {
    throw new Error('No content in Gemini response')
  }

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      console.log(`[Vertex AI V2] ✓ Image generated successfully for V${variantNumber} ${aspectRatio}`)
      return {
        base64: part.inlineData.data,
        prompt,
        model,
        assetsUsed,
      }
    }
  }

  throw new Error('No image data in Gemini response')
}

/**
 * Generate all creatives for a package (5 variants × 2 formats = 10 images)
 * Returns a generator for streaming progress updates
 */
export async function* generateAllCreativesV2(
  packageData: PackageDataForAI,
  selectedVariants: number[] = [1, 2, 3, 4, 5],
  options?: {
    includeLogo?: boolean
  }
): AsyncGenerator<{
  type: 'progress' | 'complete' | 'error'
  variant?: number
  aspectRatio?: '4:5' | '9:16'
  result?: { base64: string; prompt: string; model: string }
  error?: string
}> {
  // Load assets once
  const assets = await loadBrandAssets()
  const variants = await loadAllVariantPrompts()

  const variantMap = new Map(variants.map(v => [v.variant_number, v]))

  for (const variantNumber of selectedVariants) {
    const variant = variantMap.get(variantNumber)
    if (!variant) {
      yield {
        type: 'error',
        variant: variantNumber,
        error: `Variant ${variantNumber} not found`,
      }
      continue
    }

    // Generate 1080x1350 (4:5) for Instagram Feed
    yield { type: 'progress', variant: variantNumber, aspectRatio: '4:5' }
    try {
      const result4x5 = await generateCreativeImageV2(
        packageData,
        variantNumber,
        '4:5',
        { assets, variant, includeLogo: options?.includeLogo }
      )
      yield {
        type: 'complete',
        variant: variantNumber,
        aspectRatio: '4:5',
        result: result4x5,
      }
    } catch (error) {
      yield {
        type: 'error',
        variant: variantNumber,
        aspectRatio: '4:5',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }

    // Generate 1080x1920 (9:16)
    yield { type: 'progress', variant: variantNumber, aspectRatio: '9:16' }
    try {
      const result1920 = await generateCreativeImageV2(
        packageData,
        variantNumber,
        '9:16',
        { assets, variant, includeLogo: options?.includeLogo }
      )
      yield {
        type: 'complete',
        variant: variantNumber,
        aspectRatio: '9:16',
        result: result1920,
      }
    } catch (error) {
      yield {
        type: 'error',
        variant: variantNumber,
        aspectRatio: '9:16',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
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

  if (!process.env.GEMINI_API_KEY) {
    errors.push('GEMINI_API_KEY is not set (needed for image generation)')
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
