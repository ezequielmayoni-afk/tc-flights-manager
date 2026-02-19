/**
 * SISTEMA DE CREATIVOS - 3 CAPAS
 *
 * Este módulo exporta todas las funciones y tipos del sistema de generación
 * de creativos basado en 3 capas:
 *
 * - Capa 1: Prompts de imagen (destino + sentimiento)
 * - Capa 2: Copy y textos (datos + tono + marca)
 * - Capa 3: Assets y composición (layout + elementos)
 */

// Variantes
export {
  VARIANTS,
  getVariant,
  getAllVariants,
  type VariantNumber,
  type VariantDefinition
} from './variants'

// Capa 1: Prompts de imagen
export {
  DESTINATION_CONTEXTS,
  REGION_DEFAULTS,
  VARIANT_SENTIMENTS,
  getDestinationContext,
  buildLayer1Prompt,
  buildAllVariantPrompts as buildAllLayer1Prompts,
  type DestinationContext,
  type VariantSentiment
} from './layer1-prompts'

// Capa 2: Copy y textos
export {
  BRAND_RULES,
  buildCopySpecs,
  buildOverlayText,
  buildAllVariantCopies,
  packageToPackageData,
  type PackageData,
  type CopySpecs
} from './layer2-copy'

// Capa 3: Assets y composición
export {
  ASSETS,
  BRAND_COLORS,
  COMPOSITION_RULES,
  validateComposition,
  getVariantAssets,
  buildCompositionInstructions,
  type AssetKey,
  type CompositionRule,
  type ValidationResult
} from './layer3-assets'

// Prompt Builder (orquestador)
export {
  buildCreativePrompt,
  buildAllVariantPrompts,
  buildSimplePrompt,
  buildPromptFromPackage,
  getPromptSummary,
  type CreativeConfig,
  type CreativePromptResult
} from './prompt-builder'
