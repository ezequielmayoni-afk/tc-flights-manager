/**
 * Types for AI-generated creative content
 */

// Single variant output from Gemini
export interface AICreativeVariant {
  titulo_principal: string
  subtitulo: string
  precio_texto: string
  cta: string
  descripcion_imagen: string // English prompt for Imagen 3
  estilo: string // Style notes for the variant
}

// Full Gemini response with all 5 variants
export interface AICreativeOutput {
  v1: AICreativeVariant
  v2: AICreativeVariant
  v3: AICreativeVariant
  v4: AICreativeVariant
  v5: AICreativeVariant
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
  aspectRatio: '4x5' | '9x16'
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
  titulo_principal: string
  subtitulo: string
  precio_texto: string
  cta: string
  descripcion_imagen: string
  estilo: string

  // Generated images (Google Drive)
  image_4x5_file_id: string | null
  image_4x5_url: string | null
  image_9x16_file_id: string | null
  image_9x16_url: string | null

  // Generation metadata
  model_used: string // e.g., "gemini-1.5-pro"
  imagen_model_used: string | null // e.g., "imagen-3.0-generate-001"
  prompt_version: string // e.g., "v2"
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
