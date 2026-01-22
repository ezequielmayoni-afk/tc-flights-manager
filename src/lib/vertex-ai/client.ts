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
 * Default Master Prompt V2 for generating creatives
 * This can be overridden by saving a custom prompt in the database
 */
const DEFAULT_MASTER_PROMPT = `PROMPT MAESTRO: AUTOMATIZACIÓN DE ADS "SÍ, VIAJO" (V2 - Con Contexto de Destino)

ROL: Eres el Director de Arte y Diseñador Senior de la marca de turismo "Sí, Viajo". Tu objetivo es crear anuncios de alto rendimiento (Performance Ads) interpretando datos estructurados (JSON) y aplicando rigurosamente el Manual de Identidad Visual de la marca.

1. ENTRADA DE INFORMACIÓN (JSON): Analiza el siguiente objeto JSON con los datos del paquete turístico:

\`\`\`json
{{PACKAGE_JSON}}
\`\`\`

2. REGLAS VISUALES DE MARCA (Estricto Cumplimiento):

- Identidad: "Hagamos que todo suceda". Estilo cómplice, inspirador y resolutivo.
- Paleta de Colores:
  - Primario (Fondo/Peso): Azul Principal #1A237E (Indigo 900).
  - Acento (Call to Action/Resaltado): Verde Principal #1DE9B6 (Teal A400).
  - Secundarios: Cian #00AEFF y Gris #B2B2B2.
- Tipografía: Familia Montserrat. (Titulares en Bold Italic).
- Estilo Fotográfico:
  - Luz: Imágenes luminosas, full color, con sol radiante. NUNCA oscuras.
  - Factor Humano: Planos medios o cercanos. Debe haber personas disfrutando (parejas, amigos) para que el usuario se sienta parte de la experiencia.
  - Elementos Gráficos: Usa formas tipo "sticker" para precios y la flecha/contenedor de la marca para dar dinamismo.

3. CONTEXTO VISUAL DEL DESTINO (Crucial):
- La imagen de fondo debe representar fielmente el destino específico del JSON.
- Ejemplo: Si el JSON dice "Punta Cana" o "Bayahibe" -> La imagen DEBE mostrar playas de arena blanca, mar turquesa cristalino y palmeras cocoteras.
- Ejemplo: Si el JSON dice "Bariloche" -> La imagen debe mostrar montañas, lagos y bosques.
- No uses imágenes genéricas; adáptalas al lugar que se está vendiendo.

4. LÓGICA DE TEXTOS Y DATOS: Compón el anuncio usando estos datos extraídos:
- Titular: Usa el destino principal o una versión corta del título. Fuente: Montserrat Bold Italic.
- Precio Gancho: Usa current_price_per_pax. Redondea hacia abajo (elimina decimales) y antepón la moneda. Destácalo visualmente.
- Fecha: Formatea departure_date a "Mes Año" (Ej: "Abril 2026").
- Inclusiones: Si board_type es "ALL INCLUSIVE", debe aparecer grande. Si hay vuelo, añade "Vuelo Incluido".

5. INSTRUCCIONES DE SALIDA:
Genera exactamente 5 variantes (v1 a v5) con diferentes enfoques creativos:
- v1: Experiencial - Enfoque en la experiencia y emociones
- v2: Oferta/Hard Sell - Precio destacado, urgencia
- v3: Lifestyle - Enfoque aspiracional, estilo de vida
- v4: Destino - Hero shot del lugar, paisaje protagonista
- v5: Beneficios - Destacar All Inclusive, vuelo incluido, etc.

RESPONDE ÚNICAMENTE CON UN JSON VÁLIDO con esta estructura exacta:
{
  "v1": {
    "titulo_principal": "string - título llamativo para el anuncio",
    "subtitulo": "string - complemento del título (noches, régimen, etc)",
    "precio_texto": "string - precio formateado con moneda (ej: 'USD 1,234')",
    "cta": "string - call to action corto (ej: 'Reservá ahora')",
    "descripcion_imagen": "string - prompt EN INGLÉS para Imagen 3, técnico y detallado",
    "estilo": "string - notas de estilo visual para esta variante"
  },
  "v2": { ... },
  "v3": { ... },
  "v4": { ... },
  "v5": { ... },
  "metadata": {
    "destino": "string - destino principal",
    "fecha_salida": "string - fecha formateada",
    "precio_base": number,
    "currency": "string",
    "noches": number,
    "regimen": "string o null"
  }
}

IMPORTANTE para descripcion_imagen:
- Escríbelo EN INGLÉS para Imagen 3
- Debe ser técnico y detallado (50-100 palabras)
- Incluir: tipo de foto, composición, personas, luz, colores, ambiente
- Ejemplo: "Professional advertising photograph of a happy couple in their 30s relaxing in an infinity pool overlooking turquoise Caribbean waters. Palm trees frame the shot. Golden hour lighting, warm tones. Shot with professional DSLR, shallow depth of field. The mood is aspirational, romantic and luxurious. Style: high-end travel advertisement."
`

/**
 * Call Gemini API to generate creative content
 */
export async function generateCreativesWithGemini(
  packageData: PackageDataForAI
): Promise<AICreativeOutput> {
  const token = await getAccessToken()
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${GEMINI_MODEL}:generateContent`

  // Get the master prompt (from database or default)
  const masterPrompt = await getMasterPrompt()

  // Build the prompt with package data
  const prompt = masterPrompt.replace(
    '{{PACKAGE_JSON}}',
    JSON.stringify(packageData, null, 2)
  )

  console.log('[Vertex AI] Calling Gemini with package:', packageData.tc_package_id)

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
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_ONLY_HIGH',
        },
      ],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('[Vertex AI] Gemini error:', errorText)
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`)
  }

  const result = await response.json()
  console.log('[Vertex AI] Gemini response received')

  // Extract the generated content
  const content = result.candidates?.[0]?.content?.parts?.[0]?.text
  if (!content) {
    throw new Error('No content in Gemini response')
  }

  // Parse the JSON response
  try {
    const output = JSON.parse(content) as AICreativeOutput
    return output
  } catch (parseError) {
    console.error('[Vertex AI] Failed to parse Gemini response:', content)
    throw new Error('Failed to parse Gemini response as JSON')
  }
}

/**
 * Generate image using Imagen 3
 */
export async function generateImageWithImagen(
  prompt: string,
  aspectRatio: '1:1' | '9:16' | '4:5' = '1:1'
): Promise<string> {
  const token = await getAccessToken()
  const endpoint = `https://${LOCATION}-aiplatform.googleapis.com/v1/projects/${PROJECT_ID}/locations/${LOCATION}/publishers/google/models/${IMAGEN_MODEL}:predict`

  console.log('[Vertex AI] Generating image with Imagen 3...')
  console.log('[Vertex AI] Aspect ratio:', aspectRatio)

  // Map aspect ratio to Imagen format
  const imagenAspectRatio = aspectRatio === '4:5' ? '4:5' : aspectRatio === '9:16' ? '9:16' : '1:1'

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
 * Generate all images for a creative variant
 */
export async function generateVariantImages(
  variant: AICreativeVariant,
  variantNumber: number
): Promise<{ aspectRatio: '4x5' | '9x16'; base64: string }[]> {
  const images: { aspectRatio: '4x5' | '9x16'; base64: string }[] = []

  // Generate 4:5 image (square-ish for feed)
  try {
    console.log(`[Vertex AI] Generating 4x5 image for variant ${variantNumber}...`)
    const image4x5 = await generateImageWithImagen(variant.descripcion_imagen, '4:5')
    images.push({ aspectRatio: '4x5', base64: image4x5 })
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 4x5 for variant ${variantNumber}:`, error)
  }

  // Generate 9:16 image (stories/reels)
  try {
    console.log(`[Vertex AI] Generating 9x16 image for variant ${variantNumber}...`)
    const image9x16 = await generateImageWithImagen(variant.descripcion_imagen, '9:16')
    images.push({ aspectRatio: '9x16', base64: image9x16 })
  } catch (error) {
    console.error(`[Vertex AI] Failed to generate 9x16 for variant ${variantNumber}:`, error)
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
