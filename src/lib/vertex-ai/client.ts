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
  logo_base64: string
  system_instruction: string
  reference_image_1: string
  reference_image_2: string
  reference_image_3: string
  reference_image_4: string
  reference_image_5: string
  reference_image_6: string
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
    return {
      logo_base64: '',
      system_instruction: '',
      reference_image_1: '',
      reference_image_2: '',
      reference_image_3: '',
      reference_image_4: '',
      reference_image_5: '',
      reference_image_6: '',
    }
  }

  const assets: BrandAssets = {
    logo_base64: '',
    system_instruction: '',
    reference_image_1: '',
    reference_image_2: '',
    reference_image_3: '',
    reference_image_4: '',
    reference_image_5: '',
    reference_image_6: '',
  }

  for (const asset of data || []) {
    if (asset.key === 'logo_base64') assets.logo_base64 = asset.value
    if (asset.key === 'system_instruction') assets.system_instruction = asset.value
    if (asset.key === 'reference_image_1') assets.reference_image_1 = asset.value
    if (asset.key === 'reference_image_2') assets.reference_image_2 = asset.value
    if (asset.key === 'reference_image_3') assets.reference_image_3 = asset.value
    if (asset.key === 'reference_image_4') assets.reference_image_4 = asset.value
    if (asset.key === 'reference_image_5') assets.reference_image_5 = asset.value
    if (asset.key === 'reference_image_6') assets.reference_image_6 = asset.value
  }

  console.log('[Vertex AI] Brand assets loaded:', {
    logo_base64: assets.logo_base64 ? `${assets.logo_base64.length} chars` : 'empty',
    system_instruction: assets.system_instruction ? `${assets.system_instruction.length} chars` : 'empty',
    reference_images: [assets.reference_image_1, assets.reference_image_2, assets.reference_image_3, assets.reference_image_4, assets.reference_image_5, assets.reference_image_6].filter(Boolean).length,
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
 * Load the master prompt from ai_settings table
 */
async function loadMasterPrompt(): Promise<string> {
  try {
    const db = getSupabaseClient()
    const { data, error } = await db
      .from('ai_settings')
      .select('value')
      .eq('key', 'master_prompt')
      .single()

    if (error && error.code !== 'PGRST116') {
      console.warn('[Vertex AI] Error loading master_prompt:', error.message)
    }

    return data?.value || ''
  } catch (error) {
    console.warn('[Vertex AI] Error loading master_prompt:', error)
    return ''
  }
}

/**
 * Build the complete prompt for image generation using master_prompt from DB
 * Supports placeholders: {{PACKAGE_JSON}}, {{VARIANT}}, {{ASPECT_RATIO}}, {{HOOK_PHRASE}}, etc.
 * If no placeholders exist, returns master_prompt as-is (relies on system_instruction)
 */
export async function buildCompletePrompt(
  packageData: PackageDataForAI,
  variant: PromptVariant,
  aspectRatio: '1:1' | '4:5' | '9:16'
): Promise<string> {
  // Load master prompt from database
  const masterPrompt = await loadMasterPrompt()

  // Calculate values for replacement
  const destination = packageData.package_destinations?.[0] || packageData.title || 'destino'
  const price = Math.floor(packageData.current_price_per_pax || 0)
  const currency = packageData.currency || 'USD'
  const nights = packageData.nights_count || 0
  const formatName = aspectRatio === '9:16'
    ? '1080x1920 Stories/Reels (9:16)'
    : aspectRatio === '1:1'
    ? '1080x1080 Feed (1:1)'
    : '1080x1350 Feed (4:5)'

  // Get a random hook phrase from the variant
  const hookPhrase = variant.hook_phrases[Math.floor(Math.random() * variant.hook_phrases.length)]
    .replace('{price}', String(price))
    .replace('{destination}', destination)
    .replace('{DESTINATION}', destination.toUpperCase())
    .replace('{currency}', currency)
    .replace('{nights}', String(nights))

  // If no master prompt configured, use minimal prompt (relies on system_instruction)
  if (!masterPrompt) {
    console.log('[Vertex AI] No master_prompt configured, using minimal prompt')
    return buildMinimalPrompt(packageData, variant, aspectRatio, hookPhrase)
  }

  // Build package JSON for {{PACKAGE_JSON}} replacement
  const packageJson = JSON.stringify({
    ...packageData,
    _computed: {
      destination,
      price,
      currency,
      nights,
      formatName,
      aspectRatio,
      hookPhrase,
      variant: {
        number: variant.variant_number,
        name: variant.name,
        focus: variant.focus,
      }
    }
  }, null, 2)

  // Build variant info for {{VARIANT}} replacement
  const variantInfo = `[VARIANTE #${variant.variant_number}: ${variant.name}]
Focus: ${variant.focus}
Hook Phrase: "${hookPhrase}"

${variant.prompt_addition}`

  // Replace all supported placeholders
  let prompt = masterPrompt
  prompt = prompt.replace(/\{\{PACKAGE_JSON\}\}/g, packageJson)
  prompt = prompt.replace(/\{\{VARIANT\}\}/g, variantInfo)
  prompt = prompt.replace(/\{\{ASPECT_RATIO\}\}/g, `${aspectRatio} (${formatName})`)
  prompt = prompt.replace(/\{\{HOOK_PHRASE\}\}/g, hookPhrase)
  prompt = prompt.replace(/\{\{DESTINATION\}\}/g, destination)
  prompt = prompt.replace(/\{\{PRICE\}\}/g, `${currency} ${price}`)
  prompt = prompt.replace(/\{\{NIGHTS\}\}/g, String(nights))
  prompt = prompt.replace(/\{\{CURRENCY\}\}/g, currency)
  prompt = prompt.replace(/\{\{HOTEL\}\}/g, packageData.hotel?.name || 'N/A')
  prompt = prompt.replace(/\{\{REGIME\}\}/g, packageData.hotel?.board_type || 'N/A')

  console.log('[Vertex AI] Using master_prompt from DB, length:', prompt.length)
  return prompt.trim()
}

/**
 * Minimal prompt when no master_prompt is configured
 * Relies on system_instruction for brand context
 */
function buildMinimalPrompt(
  packageData: PackageDataForAI,
  variant: PromptVariant,
  aspectRatio: '1:1' | '4:5' | '9:16',
  hookPhrase: string
): string {
  const destination = packageData.package_destinations?.[0] || packageData.title || 'destino'
  const price = Math.floor(packageData.current_price_per_pax || 0)
  const currency = packageData.currency || 'USD'
  const nights = packageData.nights_count || 0

  return `Genera una imagen publicitaria para:

DESTINO: ${destination}
PRECIO: ${currency} ${price} por persona
NOCHES: ${nights}
HOTEL: ${packageData.hotel?.name || 'N/A'}
RÉGIMEN: ${packageData.hotel?.board_type || 'N/A'}

VARIANTE: ${variant.name} (${variant.focus})
HOOK: "${hookPhrase}"

FORMATO: ${aspectRatio}

${variant.prompt_addition}`.trim()
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
  aspectRatio: '1:1' | '4:5' | '9:16',
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

  // Build the complete prompt (now async, loads master_prompt from DB)
  const prompt = await buildCompletePrompt(packageData, variant, aspectRatio)

  // Track which assets were used
  const assetsUsed: string[] = []
  if (assets.logo_base64 && options?.includeLogo) assetsUsed.push('logo_base64')
  if (assets.system_instruction) assetsUsed.push('system_instruction')
  if (assets.reference_image_1) assetsUsed.push('reference_image_1')
  if (assets.reference_image_2) assetsUsed.push('reference_image_2')
  if (assets.reference_image_3) assetsUsed.push('reference_image_3')
  if (assets.reference_image_4) assetsUsed.push('reference_image_4')
  if (assets.reference_image_5) assetsUsed.push('reference_image_5')
  if (assets.reference_image_6) assetsUsed.push('reference_image_6')

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

  // Helper function to parse base64 data and extract mime type
  const parseBase64Image = (base64Data: string): { mimeType: string; data: string } => {
    let data = base64Data
    let mimeType = 'image/png'

    if (data.startsWith('data:')) {
      const match = data.match(/^data:([^;]+);base64,(.+)$/)
      if (match) {
        mimeType = match[1]
        data = match[2]
      }
    }

    return { mimeType, data }
  }

  // Build request parts
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt }
  ]

  // Add logo as image reference if available and requested
  if (assets.logo_base64 && options?.includeLogo) {
    const { mimeType, data } = parseBase64Image(assets.logo_base64)
    console.log(`[Vertex AI V2] Logo: ${data.length} chars, mime: ${mimeType}`)
    parts.push({ inlineData: { mimeType, data } })
    console.log('[Vertex AI V2] Logo added as reference image')
  }

  // Add reference images (up to 6)
  const referenceImages = [
    { key: 'reference_image_1', value: assets.reference_image_1 },
    { key: 'reference_image_2', value: assets.reference_image_2 },
    { key: 'reference_image_3', value: assets.reference_image_3 },
    { key: 'reference_image_4', value: assets.reference_image_4 },
    { key: 'reference_image_5', value: assets.reference_image_5 },
    { key: 'reference_image_6', value: assets.reference_image_6 },
  ].filter(img => img.value)

  for (const img of referenceImages) {
    const { mimeType, data } = parseBase64Image(img.value)
    console.log(`[Vertex AI V2] ${img.key}: ${data.length} chars, mime: ${mimeType}`)
    parts.push({ inlineData: { mimeType, data } })
  }

  if (referenceImages.length > 0) {
    console.log(`[Vertex AI V2] Added ${referenceImages.length} reference image(s)`)
  }

  // Build request body
  const requestBody: {
    contents: Array<{ parts: typeof parts }>
    system_instruction?: { parts: Array<{ text: string }> }
    generationConfig: {
      responseModalities: string[]
      temperature: number
      imageConfig: { aspectRatio: string }
    }
  } = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 1.0,
      imageConfig: {
        aspectRatio: aspectRatio,
      },
    },
  }

  // Add system instruction if available
  if (assets.system_instruction) {
    requestBody.system_instruction = {
      parts: [{ text: assets.system_instruction }]
    }
    console.log(`[Vertex AI V2] System instruction: ${assets.system_instruction.length} chars`)
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
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
 * Adapt an existing image to a new aspect ratio
 * This maintains visual consistency by using the original image as reference
 */
export async function adaptImageToAspectRatio(
  sourceImageBase64: string,
  targetAspectRatio: '4:5' | '1:1',
  context: {
    destination: string
    hookPhrase: string
    price: string
    currency: string
  },
  assets: BrandAssets
): Promise<{
  base64: string
  model: string
}> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set')
  }

  const model = GEMINI_IMAGE_MODEL
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  // Parse source image
  let sourceData = sourceImageBase64
  let sourceMimeType = 'image/png'
  if (sourceData.startsWith('data:')) {
    const match = sourceData.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      sourceMimeType = match[1]
      sourceData = match[2]
    }
  }

  const adaptPrompt = `
Adapta esta imagen publicitaria de viajes al formato ${targetAspectRatio}.

INSTRUCCIONES CRÍTICAS:
1. MANTENÉ exactamente el mismo diseño, colores, y estilo visual
2. MANTENÉ todos los textos en las mismas posiciones relativas:
   - Hook: "${context.hookPhrase}"
   - Precio: "${context.currency} ${context.price}"
   - Destino: "${context.destination}"
3. AJUSTÁ la composición para el nuevo formato sin perder elementos
4. NO cambies la foto de fondo ni el estilo gráfico
5. Mantené la identidad visual de Si, Viajo (Navy #1A237E, Teal #1DE9B6)

Formato objetivo: ${targetAspectRatio} ${targetAspectRatio === '4:5' ? '(1080x1350 Instagram Feed)' : '(1080x1080 cuadrado)'}
`.trim()

  // Build parts with source image
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: adaptPrompt },
    { inlineData: { mimeType: sourceMimeType, data: sourceData } }
  ]

  // Build request body
  const requestBody: {
    contents: Array<{ parts: typeof parts }>
    system_instruction?: { parts: Array<{ text: string }> }
    generationConfig: {
      responseModalities: string[]
      temperature: number
      imageConfig: { aspectRatio: string }
    }
  } = {
    contents: [{ parts }],
    generationConfig: {
      responseModalities: ['IMAGE', 'TEXT'],
      temperature: 0.5, // Lower temperature for more consistent adaptation
      imageConfig: {
        aspectRatio: targetAspectRatio,
      },
    },
  }

  // Add system instruction if available
  if (assets.system_instruction) {
    requestBody.system_instruction = {
      parts: [{ text: assets.system_instruction }]
    }
  }

  console.log(`[Vertex AI V2] Adapting image to ${targetAspectRatio}...`)

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Vertex AI V2] Adapt error:', errorText)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  const responseParts = result.candidates?.[0]?.content?.parts

  if (!responseParts || responseParts.length === 0) {
    throw new Error('No content in Gemini adapt response')
  }

  for (const part of responseParts) {
    if (part.inlineData?.data) {
      console.log(`[Vertex AI V2] ✓ Image adapted to ${targetAspectRatio}`)
      return {
        base64: part.inlineData.data,
        model,
      }
    }
  }

  throw new Error('No image data in Gemini adapt response')
}

/**
 * Generate all creatives for a package (5 variants × 2 formats = 10 images)
 * Flow: Generate 9:16 first, then adapt to 4:5 for consistency
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

  // Extract context for adaptation
  const destination = packageData.package_destinations?.[0] || packageData.title || 'destino'
  const price = String(Math.floor(packageData.current_price_per_pax || 0))
  const currency = packageData.currency || 'USD'

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

    // Get hook phrase for this variant
    const hookPhrase = variant.hook_phrases[Math.floor(Math.random() * variant.hook_phrases.length)]
      .replace('{price}', price)
      .replace('{destination}', destination)
      .replace('{DESTINATION}', destination.toUpperCase())

    // STEP 1: Generate 9:16 first (Stories/Reels - main creative)
    yield { type: 'progress', variant: variantNumber, aspectRatio: '9:16' }
    let result916: { base64: string; prompt: string; model: string; assetsUsed: string[] } | null = null

    try {
      result916 = await generateCreativeImageV2(
        packageData,
        variantNumber,
        '9:16',
        { assets, variant, includeLogo: options?.includeLogo }
      )
      yield {
        type: 'complete',
        variant: variantNumber,
        aspectRatio: '9:16',
        result: result916,
      }
    } catch (error) {
      yield {
        type: 'error',
        variant: variantNumber,
        aspectRatio: '9:16',
        error: error instanceof Error ? error.message : 'Unknown error',
      }
      // If 9:16 fails, skip 4:5 adaptation for this variant
      continue
    }

    // STEP 2: Adapt the 9:16 image to 4:5 (Feed format)
    yield { type: 'progress', variant: variantNumber, aspectRatio: '4:5' }
    try {
      const adapted4x5 = await adaptImageToAspectRatio(
        result916.base64,
        '4:5',
        { destination, hookPhrase, price, currency },
        assets
      )
      yield {
        type: 'complete',
        variant: variantNumber,
        aspectRatio: '4:5',
        result: {
          base64: adapted4x5.base64,
          prompt: `Adapted from 9:16 - ${result916.prompt.slice(0, 100)}...`,
          model: adapted4x5.model,
        },
      }
    } catch (error) {
      // If adaptation fails, try generating 4:5 from scratch as fallback
      console.warn(`[Vertex AI V2] Adaptation failed for V${variantNumber}, generating 4:5 from scratch`)
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
      } catch (fallbackError) {
        yield {
          type: 'error',
          variant: variantNumber,
          aspectRatio: '4:5',
          error: fallbackError instanceof Error ? fallbackError.message : 'Unknown error',
        }
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
