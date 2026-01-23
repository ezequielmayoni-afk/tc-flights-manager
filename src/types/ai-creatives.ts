/**
 * Types for AI-generated creative content
 */

// Single format output (1080x1080 or 1080x1920)
export interface AICreativeFormat {
  titulo_principal: string
  subtitulo: string
  precio_texto: string
  cta: string
  descripcion_imagen: string // English prompt for Gemini 3 Pro Image (with text rendering)
  estilo: string // Style notes for the variant
}

// Single variant output from Gemini with dual formats
export interface AICreativeVariant {
  concepto: string
  formato_1080: AICreativeFormat // 1:1 (1080x1080) for Feed
  formato_1920: AICreativeFormat // 9:16 (1080x1920) for Stories/Reels
}

// Full Gemini response with all 5 variants
export interface AICreativeOutput {
  variante_1_precio: AICreativeVariant
  variante_2_experiencia: AICreativeVariant
  variante_3_destino: AICreativeVariant
  variante_4_conveniencia: AICreativeVariant
  variante_5_escasez: AICreativeVariant
  metadata: {
    destino: string
    fecha_salida: string
    precio_base: number
    currency: string
    noches: number
    regimen: string | null
  }
}

// Generated image info
export interface AIGeneratedImage {
  variant: number
  aspectRatio: '1080' | '1920' // 1080x1080 (1:1) or 1080x1920 (9:16)
  imageUrl: string // Google Drive URL or base64
  fileId?: string // Google Drive file ID if uploaded
}

// Database record for package_ai_creatives
export interface PackageAICreative {
  id: number
  package_id: number
  tc_package_id: number

  // Generated content
  variant: number // 1-5
  concepto: string
  // Format 1080 (1:1)
  titulo_principal_1080: string
  subtitulo_1080: string
  precio_texto_1080: string
  cta_1080: string
  descripcion_imagen_1080: string
  estilo_1080: string
  // Format 1920 (16:9)
  titulo_principal_1920: string
  subtitulo_1920: string
  precio_texto_1920: string
  cta_1920: string
  descripcion_imagen_1920: string
  estilo_1920: string

  // Generated images (Google Drive)
  image_1080_file_id: string | null
  image_1080_url: string | null
  image_1920_file_id: string | null
  image_1920_url: string | null

  // Generation metadata
  model_used: string // e.g., "gemini-2.0-flash"
  imagen_model_used: string | null // e.g., "gemini-3-pro-image-preview" (for images with text)
  prompt_version: string // e.g., "v3"
  generation_cost_tokens: number | null

  // Timestamps
  created_at: string
  updated_at: string
}

// Request payload for the API
export interface GenerateCreativesRequest {
  packageId: number // tc_package_id
  regenerateImages?: boolean // If true, regenerate images even if they exist
  variants?: number[] // Specific variants to generate (default: all 5)
}

// Response from the API
export interface GenerateCreativesResponse {
  success: boolean
  packageId: number
  output: AICreativeOutput
  images?: AIGeneratedImage[]
  savedToDb: boolean
  error?: string
}

// Package data structure sent to Gemini
export interface PackageDataForAI {
  tc_package_id: number
  title: string
  package_destinations: string[]
  departure_date: string | null
  date_range_start: string | null
  date_range_end: string | null
  nights_count: number
  current_price_per_pax: number | null
  total_price: number | null
  currency: string
  adults_count: number
  children_count: number
  infants_count: number
  hotel: {
    name: string | null
    room_type: string | null
    board_type: string | null
    board_name: string | null
  } | null
  flight: {
    company: string | null
    flight_numbers: string[]
    departure_date: string | null
  } | null
  themes?: string[]
}
