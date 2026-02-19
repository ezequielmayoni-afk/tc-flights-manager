/**
 * CAPA 2: COMUNICACIÓN Y TEXTOS
 *
 * Fórmula: Copywriting = Datos del JSON + Tono de la Variante + Lenguaje de Marca "Sí, Viajo"
 *
 * Esta capa genera los textos y copy para cada variante combinando:
 * 1. Datos duros del paquete (destino, precio, noches, beneficios)
 * 2. Tono y estilo de cada variante
 * 3. Reglas de marca de "Sí, Viajo"
 */

import { VariantNumber } from './variants'

// ============================================
// TIPOS
// ============================================

export interface PackageData {
  destination: string
  price: number
  currency: string
  nights: number
  boardType: string | null  // "All Inclusive", "Desayuno", etc.
  flightIncluded: boolean
  airline: string | null
  hotelName: string | null
  departureDate: string | null
}

export interface CopySpecs {
  headline: string
  subheadline: string | null
  priceText: string
  stickerText: string
  ctaText: string
  tone: string
  protagonist: 'price' | 'phrase' | 'destination' | 'benefit' | 'urgency'
  priceSize: 'giant' | 'medium' | 'small'
}

// ============================================
// REGLAS DE MARCA "SÍ, VIAJO"
// ============================================

export const BRAND_RULES = {
  typography: 'Montserrat',
  voice: {
    brand: 'Nosotros',
    client: 'Vos'
  },
  keywords: ['Sí', 'Decí que sí', 'Tu próximo sí', 'Ofertas que sí'],
  colors: {
    primary: '#1A237E',    // Azul oscuro
    accent: '#1DE9B6',     // Verde/Turquesa
    white: '#FFFFFF'
  },
  forbidden: ['Usted', 'Estimado/a', 'Corporativo', 'Formal']
}

// ============================================
// HEADLINES POR VARIANTE
// ============================================

interface HeadlineTemplate {
  templates: string[]
  stickerOptions: string[]
  ctaOptions: string[]
  tone: string
}

const VARIANT_HEADLINES: Record<VariantNumber, HeadlineTemplate> = {
  1: {
    // PRECIO / OFERTA
    templates: [
      'OFERTA FLASH',
      'PRECIO ÚNICO',
      'OPORTUNIDAD',
      '¡BAJÓ EL PRECIO!',
      'MEJOR PRECIO',
      'OFERTA IMPERDIBLE'
    ],
    stickerOptions: [
      'MEJOR PRECIO',
      'OFERTA ÚNICA',
      'ÚLTIMAS HORAS',
      'PRECIO FINAL'
    ],
    ctaOptions: [
      'RESERVÁ AHORA',
      'NO LO PIENSES MÁS',
      'APROVECHÁ YA',
      'DECÍ QUE SÍ'
    ],
    tone: 'Directo y decidido. Urgencia por valor.'
  },
  2: {
    // EXPERIENCIA / EMOCIÓN
    templates: [
      '¿Te imaginás acá?',
      'Vivilo vos mismo',
      'Tu próximo sí',
      'Escapate',
      '¿Y si decís que sí?',
      'Dejate llevar'
    ],
    stickerOptions: [
      'EXPERIENCIA TOTAL',
      'VIVÍ EL MOMENTO',
      'TU ESCAPE',
      'SOÑÁ DESPIERTO'
    ],
    ctaOptions: [
      'EMPEZÁ A SOÑAR',
      'DECÍ QUE SÍ',
      'RESERVÁ TU ESCAPE',
      'VIVÍ LA EXPERIENCIA'
    ],
    tone: 'Cálido, propositivo y apasionado. Uso de preguntas y emojis.'
  },
  3: {
    // DESTINO
    templates: [
      '{destination}',
      'DESCUBRÍ {destination}',
      '{destination} TE ESPERA',
      'CONOCÉ {destination}'
    ],
    stickerOptions: [
      'VUELO + HOTEL',
      'PAQUETE COMPLETO',
      'TODO INCLUIDO',
      'DESTINO IMPERDIBLE'
    ],
    ctaOptions: [
      'CONOCÉ MÁS',
      'EXPLORÁ',
      'DESCUBRILO',
      'RESERVÁ TU VIAJE'
    ],
    tone: 'Cómplice y experto. "Conocé lo mejor del Caribe".'
  },
  4: {
    // CONVENIENCIA
    templates: [
      'TODO RESUELTO',
      'SOLO DISFRUTÁ',
      'VIAJÁ SIN VUELTAS',
      'CERO ESTRÉS',
      'NOSOTROS NOS OCUPAMOS',
      'VOS RELAJATE'
    ],
    stickerOptions: [
      'PACK COMPLETO',
      'TODO INCLUIDO',
      'CUOTAS SIN INTERÉS',
      'SIN SORPRESAS'
    ],
    ctaOptions: [
      'CONSULTÁ AHORA',
      'PEDÍ TU PRESUPUESTO',
      'VIAJÁ TRANQUILO',
      'DEJALO EN NUESTRAS MANOS'
    ],
    tone: 'Resolutivo y confiable. "Nosotros nos ocupamos".'
  },
  5: {
    // ESCASEZ
    templates: [
      '¡ÚLTIMOS LUGARES!',
      'SE TERMINA',
      'SOLO POR HOY',
      '¡ÚLTIMOS CUPOS!',
      'NO TE LO PIERDAS',
      'AHORA O NUNCA'
    ],
    stickerOptions: [
      'ÚLTIMOS 5 CUPOS',
      'SALIDA {month}',
      'CIERRA HOY',
      '¡QUEDAN POCOS!'
    ],
    ctaOptions: [
      '¡RESERVÁ YA!',
      'NO TE QUEDES AFUERA',
      'ASEGURÁ TU LUGAR',
      '¿TE LO VAS A PERDER?'
    ],
    tone: 'Directo, decidido y desafiante. "¿Te lo vas a perder?".'
  }
}

// ============================================
// FUNCIONES DE GENERACIÓN
// ============================================

/**
 * Formatea el precio para mostrar
 */
function formatPrice(price: number, currency: string): string {
  const formatted = Math.round(price).toLocaleString('es-AR')
  if (currency === 'USD') {
    return `USD ${formatted}`
  } else if (currency === 'ARS') {
    return `$ ${formatted}`
  }
  return `${currency} ${formatted}`
}

/**
 * Obtiene el mes de una fecha
 */
function getMonthName(dateStr: string | null): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const months = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
  return months[date.getMonth()]
}

/**
 * Selecciona un elemento aleatorio de un array
 */
function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/**
 * Reemplaza placeholders en un template
 */
function replacePlaceholders(template: string, data: PackageData): string {
  return template
    .replace(/{destination}/gi, data.destination.toUpperCase())
    .replace(/{price}/gi, formatPrice(data.price, data.currency))
    .replace(/{nights}/gi, `${data.nights} NOCHES`)
    .replace(/{month}/gi, getMonthName(data.departureDate))
    .replace(/{hotel}/gi, data.hotelName || '')
    .replace(/{airline}/gi, data.airline || '')
}

/**
 * Genera las especificaciones de copy para una variante
 */
export function buildCopySpecs(
  packageData: PackageData,
  variantNumber: VariantNumber
): CopySpecs {
  const headlines = VARIANT_HEADLINES[variantNumber]

  // Seleccionar templates
  let headline = pickRandom(headlines.templates)
  let stickerText = pickRandom(headlines.stickerOptions)
  const ctaText = pickRandom(headlines.ctaOptions)

  // Reemplazar placeholders
  headline = replacePlaceholders(headline, packageData)
  stickerText = replacePlaceholders(stickerText, packageData)

  // Determinar protagonista y tamaño de precio según variante
  let protagonist: CopySpecs['protagonist']
  let priceSize: CopySpecs['priceSize']
  let subheadline: string | null = null

  switch (variantNumber) {
    case 1: // OFERTA
      protagonist = 'price'
      priceSize = 'giant'
      subheadline = `${packageData.nights} noches ${packageData.boardType ? `• ${packageData.boardType}` : ''}`
      break
    case 2: // EMOCIÓN
      protagonist = 'phrase'
      priceSize = 'small'
      subheadline = packageData.destination
      break
    case 3: // DESTINO
      protagonist = 'destination'
      priceSize = 'medium'
      subheadline = `Desde ${formatPrice(packageData.price, packageData.currency)} por persona`
      break
    case 4: // CONVENIENCIA
      protagonist = 'benefit'
      priceSize = 'medium'
      subheadline = packageData.boardType || 'Vuelo + Hotel incluido'
      break
    case 5: // ESCASEZ
      protagonist = 'urgency'
      priceSize = 'medium'
      subheadline = `Salida ${getMonthName(packageData.departureDate)} • ${formatPrice(packageData.price, packageData.currency)}`
      break
  }

  // Formatear precio
  const priceText = formatPrice(packageData.price, packageData.currency)

  return {
    headline,
    subheadline,
    priceText,
    stickerText,
    ctaText,
    tone: headlines.tone,
    protagonist,
    priceSize
  }
}

/**
 * Genera el texto completo formateado para overlay
 */
export function buildOverlayText(
  packageData: PackageData,
  variantNumber: VariantNumber
): {
  specs: CopySpecs
  formattedText: string
} {
  const specs = buildCopySpecs(packageData, variantNumber)

  // Generar texto formateado para el prompt de imagen
  const formattedText = `
HEADLINE: "${specs.headline}"
${specs.subheadline ? `SUBHEADLINE: "${specs.subheadline}"` : ''}
PRICE: "${specs.priceText}" (size: ${specs.priceSize})
STICKER: "${specs.stickerText}"
CTA: "${specs.ctaText}"
VISUAL PROTAGONIST: ${specs.protagonist}
TONE: ${specs.tone}
  `.trim()

  return { specs, formattedText }
}

/**
 * Genera todos los copies para todas las variantes
 */
export function buildAllVariantCopies(packageData: PackageData): Record<VariantNumber, CopySpecs> {
  return {
    1: buildCopySpecs(packageData, 1),
    2: buildCopySpecs(packageData, 2),
    3: buildCopySpecs(packageData, 3),
    4: buildCopySpecs(packageData, 4),
    5: buildCopySpecs(packageData, 5)
  }
}

/**
 * Convierte datos de paquete de la BD al formato de PackageData
 */
export function packageToPackageData(pkg: {
  package_destinations?: string[]
  current_price_per_pax?: number | null
  currency?: string
  nights_count?: number
  flight?: { company?: string | null } | null
  hotel?: { name?: string | null; board_type?: string | null } | null
  departure_date?: string | null
}): PackageData {
  return {
    destination: pkg.package_destinations?.[0] || 'Destino',
    price: pkg.current_price_per_pax || 0,
    currency: pkg.currency || 'USD',
    nights: pkg.nights_count || 7,
    boardType: pkg.hotel?.board_type || null,
    flightIncluded: true,
    airline: pkg.flight?.company || null,
    hotelName: pkg.hotel?.name || null,
    departureDate: pkg.departure_date || null
  }
}
