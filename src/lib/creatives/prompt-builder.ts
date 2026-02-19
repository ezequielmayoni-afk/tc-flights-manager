/**
 * PROMPT BUILDER - Orquestador de las 3 Capas
 *
 * Este módulo combina las 3 capas para generar el prompt final
 * que se envía a Gemini para generar el creativo.
 *
 * Flujo:
 * 1. Capa 1: Genera prompt de imagen (destino + sentimiento)
 * 2. Capa 2: Genera especificaciones de copy (datos + tono)
 * 3. Capa 3: Define composición y assets (layout + elementos)
 * 4. Combina todo en un prompt unificado para Gemini
 */

import { VariantNumber, getVariant, VARIANTS } from './variants'
import { buildLayer1Prompt, getDestinationContext } from './layer1-prompts'
import { buildCopySpecs, buildOverlayText, PackageData, CopySpecs, packageToPackageData } from './layer2-copy'
import { buildCompositionInstructions, getVariantAssets, BRAND_COLORS, ASSETS } from './layer3-assets'

// ============================================
// TIPOS
// ============================================

export interface CreativeConfig {
  packageData: PackageData
  variantNumber: VariantNumber
  aspectRatio: '1:1' | '9:16' | '4:5'
  includeLogo?: boolean
  backgroundLuminosity?: number
}

export interface CreativePromptResult {
  // Prompt final para Gemini
  fullPrompt: string

  // Componentes individuales (para debugging/logging)
  layer1: {
    imagePrompt: string
    destinationContext: ReturnType<typeof getDestinationContext>
  }
  layer2: {
    copySpecs: CopySpecs
    overlayText: string
  }
  layer3: {
    compositionInstructions: string
    requiredAssets: string[]
  }

  // Metadata
  variant: ReturnType<typeof getVariant>
  aspectRatio: string
}

// ============================================
// PROMPT PRINCIPAL
// ============================================

/**
 * Construye el prompt completo para generar un creativo
 * Combina las 3 capas en un único prompt para Gemini
 */
export function buildCreativePrompt(config: CreativeConfig): CreativePromptResult {
  const { packageData, variantNumber, aspectRatio, backgroundLuminosity } = config

  // Obtener información de la variante
  const variant = getVariant(variantNumber)

  // ==================
  // CAPA 1: IMAGEN
  // ==================
  const imagePrompt = buildLayer1Prompt(
    packageData.destination,
    variantNumber,
    aspectRatio
  )
  const destinationContext = getDestinationContext(packageData.destination)

  // ==================
  // CAPA 2: COPY
  // ==================
  const copySpecs = buildCopySpecs(packageData, variantNumber)
  const { formattedText: overlayText } = buildOverlayText(packageData, variantNumber)

  // ==================
  // CAPA 3: COMPOSICIÓN
  // ==================
  const compositionInstructions = buildCompositionInstructions(variantNumber, backgroundLuminosity)
  const { required: requiredAssets } = getVariantAssets(variantNumber)

  // ==================
  // PROMPT COMBINADO
  // ==================
  const fullPrompt = `
You are a professional travel advertising designer creating a social media creative for "Sí, Viajo" travel agency.

=== CREATIVE BRIEF ===
Variant: ${variant.name} (${variant.objective})
Aspect Ratio: ${aspectRatio}
Destination: ${packageData.destination}

=== PART 1: BACKGROUND IMAGE ===
${imagePrompt}

=== PART 2: TEXT OVERLAY ===
Generate a travel ad with the following text elements:

${overlayText}

PACKAGE DETAILS:
- Destination: ${packageData.destination}
- Price: ${copySpecs.priceText} per person
- Duration: ${packageData.nights} nights
- Board: ${packageData.boardType || 'N/A'}
- Airline: ${packageData.airline || 'Included flight'}
- Hotel: ${packageData.hotelName || 'Quality hotel'}

=== PART 3: VISUAL COMPOSITION ===
${compositionInstructions}

=== BRAND GUIDELINES ===
BRAND: "Sí, Viajo" - Argentine travel agency
VOICE: Warm, friendly, uses "vos" (Argentine Spanish)
KEYWORDS: Integrate "Sí" naturally when possible

COLORS TO USE:
- Primary Blue: ${BRAND_COLORS.primary_blue} (for text, elements)
- Accent Green/Turquoise: ${BRAND_COLORS.accent_green} (for highlights, CTAs)
- White: ${BRAND_COLORS.white} (for contrast, readability)

TYPOGRAPHY: Montserrat font family
- Headlines: Montserrat Bold or ExtraBold
- Body: Montserrat Regular or Medium
- Price: Montserrat Black (when giant)

=== FINAL OUTPUT ===
Create a single, complete advertising image that:
1. Uses the background style described in Part 1
2. Overlays the text elements from Part 2
3. Follows the composition layout from Part 3
4. Adheres to brand guidelines

The image should look like a professional travel agency ad ready for Instagram/Facebook.
Do NOT include any placeholder text - use the actual values provided.
Make text clearly readable with appropriate contrast.
`.trim()

  return {
    fullPrompt,
    layer1: {
      imagePrompt,
      destinationContext
    },
    layer2: {
      copySpecs,
      overlayText
    },
    layer3: {
      compositionInstructions,
      requiredAssets: requiredAssets.map(key => ASSETS[key])
    },
    variant,
    aspectRatio
  }
}

/**
 * Construye prompts para todas las variantes de un paquete
 */
export function buildAllVariantPrompts(
  packageData: PackageData,
  aspectRatio: '1:1' | '9:16' | '4:5' = '4:5'
): Record<VariantNumber, CreativePromptResult> {
  const variants: VariantNumber[] = [1, 2, 3, 4, 5]

  return variants.reduce((acc, variantNumber) => {
    acc[variantNumber] = buildCreativePrompt({
      packageData,
      variantNumber,
      aspectRatio
    })
    return acc
  }, {} as Record<VariantNumber, CreativePromptResult>)
}

/**
 * Versión simplificada del prompt para debugging
 */
export function buildSimplePrompt(config: CreativeConfig): string {
  const result = buildCreativePrompt(config)
  return result.fullPrompt
}

// ============================================
// UTILIDADES
// ============================================

/**
 * Convierte un paquete de la BD al formato requerido y genera el prompt
 */
export function buildPromptFromPackage(
  pkg: Parameters<typeof packageToPackageData>[0],
  variantNumber: VariantNumber,
  aspectRatio: '1:1' | '9:16' | '4:5' = '4:5'
): CreativePromptResult {
  const packageData = packageToPackageData(pkg)
  return buildCreativePrompt({
    packageData,
    variantNumber,
    aspectRatio
  })
}

/**
 * Obtiene un resumen de la configuración para logging
 */
export function getPromptSummary(result: CreativePromptResult): {
  variant: string
  destination: string
  headline: string
  price: string
  protagonist: string
  assets: string[]
} {
  return {
    variant: `V${result.variant.number}: ${result.variant.name}`,
    destination: result.layer1.destinationContext.name,
    headline: result.layer2.copySpecs.headline,
    price: result.layer2.copySpecs.priceText,
    protagonist: result.layer2.copySpecs.protagonist,
    assets: result.layer3.requiredAssets
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  // Variantes
  VARIANTS,
  getVariant,

  // Capa 1
  getDestinationContext,
  buildLayer1Prompt,

  // Capa 2
  buildCopySpecs,
  packageToPackageData,

  // Capa 3
  buildCompositionInstructions,
  getVariantAssets,
  ASSETS,
  BRAND_COLORS
}

// Re-export types
export type { VariantNumber } from './variants'
export type { PackageData, CopySpecs } from './layer2-copy'
