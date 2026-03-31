/**
 * VARIANTES DE CREATIVOS - Sistema de 3 Capas
 *
 * Define las 5 variantes de comunicación visual para los creativos.
 * Cada variante tiene un enfoque diferente para captar la atención del usuario.
 */

export type VariantNumber = 1 | 2 | 3 | 4 | 5

export interface VariantDefinition {
  number: VariantNumber
  name: string
  slug: string
  objective: string
  sentiment: string
  description: string
}

/**
 * Las 5 variantes de comunicación visual
 */
export const VARIANTS: Record<VariantNumber, VariantDefinition> = {
  1: {
    number: 1,
    name: 'PRECIO / OFERTA',
    slug: 'oferta',
    objective: 'Racional y Urgente',
    sentiment: 'Urgency / Clarity',
    description: 'Urgencia por valor, oportunidad única, "este precio no dura"'
  },
  2: {
    number: 2,
    name: 'EXPERIENCIA / EMOCIÓN',
    slug: 'emocion',
    objective: 'Inspiracional y Sensorial',
    sentiment: 'Dreamy / Romantic',
    description: 'Apelar al deseo, escaparse, imaginarse ahí'
  },
  3: {
    number: 3,
    name: 'DESTINO',
    slug: 'destino',
    objective: 'Informativo e Icónico',
    sentiment: 'Iconic / Grandeur',
    description: 'Destacar lo único e irresistible del lugar'
  },
  4: {
    number: 4,
    name: 'CONVENIENCIA',
    slug: 'conveniencia',
    objective: 'Seguridad y Facilidad',
    sentiment: 'Chill / Peace',
    description: 'Todo resuelto, cero estrés, viajar fácil'
  },
  5: {
    number: 5,
    name: 'ESCASEZ',
    slug: 'escasez',
    objective: 'Acción Inmediata',
    sentiment: 'Action / Now',
    description: 'Últimos lugares, cupos reales, decisión ahora'
  }
}

/**
 * Base variant numbers (the 5 strategic variants used by AI generation)
 */
export const BASE_VARIANTS: number[] = [1, 2, 3, 4, 5]

/**
 * Labels for all variants. Base 5 have strategic names, extras are generic.
 */
export const VARIANT_LABELS: Record<number, string> = {
  1: 'Precio/Oferta',
  2: 'Experiencia',
  3: 'Destino',
  4: 'Conveniencia',
  5: 'Escasez',
}

/**
 * Get label for any variant number
 */
export function getVariantLabel(n: number): string {
  return VARIANT_LABELS[n] || `Extra ${n}`
}

/**
 * Obtener variante por número
 */
export function getVariant(number: VariantNumber): VariantDefinition {
  return VARIANTS[number]
}

/**
 * Obtener todas las variantes como array
 */
export function getAllVariants(): VariantDefinition[] {
  return Object.values(VARIANTS)
}
