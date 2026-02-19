/**
 * CAPA 1: PROMPTS DE IMAGEN
 *
 * Fórmula: Prompt de Imagen = Contexto del Destino + Sentimiento de la Variante
 *
 * Esta capa genera el prompt para la IA de imagen (Gemini) combinando:
 * 1. El contexto visual del destino (playa, montaña, ciudad, etc.)
 * 2. El sentimiento/estilo de la variante (urgencia, emoción, etc.)
 */

import { VariantNumber } from './variants'

// ============================================
// CONTEXTO DE DESTINOS
// ============================================

export interface DestinationContext {
  code: string
  name: string
  country: string
  region: 'caribbean' | 'beach' | 'mountain' | 'city' | 'europe' | 'usa' | 'brazil' | 'patagonia'
  visualElements: string
  seasonalNote?: string
}

/**
 * Diccionario de contextos visuales por destino
 * Si el destino no está en el diccionario, se usa inferencia por región
 */
export const DESTINATION_CONTEXTS: Record<string, DestinationContext> = {
  // CARIBE
  'punta cana': {
    code: 'PUJ',
    name: 'Punta Cana',
    country: 'Dominican Republic',
    region: 'caribbean',
    visualElements: 'Caribbean beach, white sand, turquoise crystal clear water, palm trees, tropical paradise, coconut palms'
  },
  'cancun': {
    code: 'CUN',
    name: 'Cancún',
    country: 'Mexico',
    region: 'caribbean',
    visualElements: 'Caribbean beach, white sand, turquoise water, Mayan Riviera, palm trees, luxury resorts backdrop'
  },
  'bayahibe': {
    code: 'BAY',
    name: 'Bayahibe',
    country: 'Dominican Republic',
    region: 'caribbean',
    visualElements: 'Caribbean beach, crystal clear turquoise water, fishing boats, palm trees, secluded paradise'
  },
  'aruba': {
    code: 'AUA',
    name: 'Aruba',
    country: 'Aruba',
    region: 'caribbean',
    visualElements: 'Caribbean beach, white sand, turquoise water, divi-divi trees, flamingos, desert cacti near beach'
  },
  'cartagena': {
    code: 'CTG',
    name: 'Cartagena',
    country: 'Colombia',
    region: 'caribbean',
    visualElements: 'Colonial walled city, colorful buildings, Caribbean sea, historic architecture, bougainvillea flowers'
  },
  'san andres': {
    code: 'ADZ',
    name: 'San Andrés',
    country: 'Colombia',
    region: 'caribbean',
    visualElements: 'Caribbean island, seven colors sea, crystal clear water, coral reefs, tropical paradise'
  },
  'curacao': {
    code: 'CUR',
    name: 'Curazao',
    country: 'Curacao',
    region: 'caribbean',
    visualElements: 'Colorful Dutch colonial buildings, Caribbean water, Willemstad, pastel architecture, beach coves'
  },

  // BRASIL
  'rio de janeiro': {
    code: 'RIO',
    name: 'Rio de Janeiro',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Copacabana beach, Sugarloaf mountain, Christ the Redeemer, tropical city, green mountains meeting the sea'
  },
  'buzios': {
    code: 'BZS',
    name: 'Búzios',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Brazilian beach peninsula, charming fishing village, multiple beaches, cobblestone streets, Brigitte Bardot statue'
  },
  'florianopolis': {
    code: 'FLN',
    name: 'Florianópolis',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Brazilian island, green hills, pristine beaches, surfing waves, lagoons, Atlantic forest'
  },
  'maragogi': {
    code: 'MCZ',
    name: 'Maragogi',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Natural pools in the sea, crystal clear water, coral reefs, coconut palms, Brazilian Caribbean'
  },
  'salvador de bahia': {
    code: 'SSA',
    name: 'Salvador de Bahía',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Colonial Pelourinho, colorful historic buildings, Afro-Brazilian culture, bay views, tropical beaches'
  },
  'porto de galinhas': {
    code: 'REC',
    name: 'Porto de Galinhas',
    country: 'Brazil',
    region: 'brazil',
    visualElements: 'Natural tide pools, colorful fish, coral reefs, coconut palms, Brazilian northeast paradise'
  },

  // PATAGONIA
  'bariloche': {
    code: 'BRC',
    name: 'Bariloche',
    country: 'Argentina',
    region: 'patagonia',
    visualElements: 'Patagonian mountains, Nahuel Huapi lake, snow peaks, wooden alpine architecture, forests',
    seasonalNote: 'Winter: snow covered mountains, ski slopes. Summer: green forests, blue lakes'
  },
  'calafate': {
    code: 'FTE',
    name: 'El Calafate',
    country: 'Argentina',
    region: 'patagonia',
    visualElements: 'Perito Moreno glacier, ice formations, Lago Argentino, Patagonian steppe, dramatic landscapes'
  },
  'ushuaia': {
    code: 'USH',
    name: 'Ushuaia',
    country: 'Argentina',
    region: 'patagonia',
    visualElements: 'End of the world, Beagle channel, snow mountains, Tierra del Fuego, dramatic fjords'
  },

  // USA
  'miami': {
    code: 'MIA',
    name: 'Miami',
    country: 'USA',
    region: 'usa',
    visualElements: 'South Beach, Art Deco buildings, palm trees, ocean drive, pastel colors, beach lifestyle'
  },
  'new york': {
    code: 'NYC',
    name: 'Nueva York',
    country: 'USA',
    region: 'city',
    visualElements: 'Manhattan skyline, Times Square lights, Central Park, Brooklyn Bridge, iconic skyscrapers'
  },
  'orlando': {
    code: 'MCO',
    name: 'Orlando',
    country: 'USA',
    region: 'usa',
    visualElements: 'Theme parks, Disney castle, Universal Studios, palm trees, family entertainment, magic'
  },
  'las vegas': {
    code: 'LAS',
    name: 'Las Vegas',
    country: 'USA',
    region: 'usa',
    visualElements: 'Strip lights, casino hotels, desert, neon signs, entertainment capital, luxury'
  },

  // EUROPA
  'paris': {
    code: 'PAR',
    name: 'París',
    country: 'France',
    region: 'europe',
    visualElements: 'Eiffel Tower, Seine river, romantic streets, cafe terraces, Parisian architecture, spring blossoms'
  },
  'roma': {
    code: 'ROM',
    name: 'Roma',
    country: 'Italy',
    region: 'europe',
    visualElements: 'Colosseum, Roman ruins, fountains, terracotta rooftops, Vatican, piazzas, historic grandeur'
  },
  'barcelona': {
    code: 'BCN',
    name: 'Barcelona',
    country: 'Spain',
    region: 'europe',
    visualElements: 'Sagrada Familia, Mediterranean beach, Gaudi architecture, Gothic quarter, La Rambla'
  },
  'madrid': {
    code: 'MAD',
    name: 'Madrid',
    country: 'Spain',
    region: 'europe',
    visualElements: 'Royal Palace, Gran Via, Retiro Park, Spanish architecture, vibrant plazas, cultural capital'
  },
  'london': {
    code: 'LON',
    name: 'Londres',
    country: 'UK',
    region: 'europe',
    visualElements: 'Big Ben, Tower Bridge, red buses, British architecture, Thames river, royal palaces'
  }
}

/**
 * Contextos por defecto según región (fallback)
 */
export const REGION_DEFAULTS: Record<string, string> = {
  caribbean: 'Caribbean beach, white sand, turquoise crystal clear water, palm trees, tropical paradise',
  beach: 'Beautiful beach, clear water, sand, relaxing atmosphere, coastal paradise',
  mountain: 'Mountain landscape, snow peaks, forests, lakes, alpine scenery',
  city: 'Urban skyline, iconic architecture, vibrant streets, city lights',
  europe: 'European architecture, historic streets, cultural landmarks, charming atmosphere',
  usa: 'American landscape, iconic landmarks, diverse scenery',
  brazil: 'Brazilian beach, tropical paradise, vibrant colors, natural beauty',
  patagonia: 'Patagonian landscape, mountains, glaciers, pristine nature, dramatic scenery'
}

// ============================================
// SENTIMIENTOS POR VARIANTE
// ============================================

export interface VariantSentiment {
  cameraStyle: string
  lighting: string
  mood: string
  composition: string
  mustInclude: string
  technicalNote: string
}

/**
 * Instrucciones de imagen por variante
 * Cada variante tiene un estilo visual diferente
 */
export const VARIANT_SENTIMENTS: Record<VariantNumber, VariantSentiment> = {
  1: {
    // OFERTA - Urgencia / Claridad
    cameraStyle: 'Wide angle shot',
    lighting: 'Bright daylight, high contrast',
    mood: 'Clean, clear, professional',
    composition: '70% clear blue sky at the top (negative space for text overlay). Horizon line in lower third.',
    mustInclude: 'No people in foreground. Minimalist composition. Empty sky area for price sticker.',
    technicalNote: 'CRITICAL: Large empty sky area required for price overlay. Avoid clouds or objects in upper portion.'
  },
  2: {
    // EMOCIÓN - Dreamy / Romántico
    cameraStyle: 'Close up or medium shot',
    lighting: 'Golden hour lighting (sunset/sunrise), warm tones',
    mood: 'Dreamy, romantic, aspirational',
    composition: 'Happy couple or person enjoying the destination. Soft focus background.',
    mustInclude: 'Human element showing emotion/happiness. Warm color palette. Immersive feeling.',
    technicalNote: 'Focus on the experience and emotion. Can have less negative space as text will be overlaid with shadow.'
  },
  3: {
    // DESTINO - Icónico / Grandeza
    cameraStyle: 'Aerial drone shot or wide panoramic view',
    lighting: 'Vivid, saturated colors, clear day',
    mood: 'Epic, breathtaking, iconic',
    composition: 'Nature is the protagonist. Showcase the unique beauty of the destination.',
    mustInclude: 'Iconic landmarks or unique features of the destination. Crystal clear water texture if beach.',
    technicalNote: 'CRITICAL: Keep upper 30% relatively clear for destination name overlay. Dramatic but readable.'
  },
  4: {
    // CONVENIENCIA - Chill / Paz
    cameraStyle: 'POV (Point of view) from lounge chair or relaxed position',
    lighting: 'Soft sunlight, comfortable warmth',
    mood: 'Relaxed, peaceful, stress-free',
    composition: 'Looking at the sea/view from a comfortable spot. Maybe a tropical drink in foreground.',
    mustInclude: 'Elements that suggest comfort: lounger, drink, book, feet up. Relaxed atmosphere.',
    technicalNote: 'Left side should have space for service badges (flight, hotel icons).'
  },
  5: {
    // ESCASEZ - Acción / Ahora
    cameraStyle: 'Dynamic shot with movement',
    lighting: 'Bright midday sun, high energy',
    mood: 'Energetic, active, exciting',
    composition: 'Someone running into water, jumping, or active movement. Motion blur effect.',
    mustInclude: 'Action and movement. High energy. Sense of "doing it now".',
    technicalNote: 'Image should convey urgency and action. Half the image can be used for color overlay with text.'
  }
}

// ============================================
// GENERADOR DE PROMPTS
// ============================================

/**
 * Obtiene el contexto visual de un destino
 * Si no existe en el diccionario, intenta inferir por nombre o usa default
 */
export function getDestinationContext(destinationName: string): DestinationContext {
  const normalized = destinationName.toLowerCase().trim()

  // Buscar coincidencia exacta
  if (DESTINATION_CONTEXTS[normalized]) {
    return DESTINATION_CONTEXTS[normalized]
  }

  // Buscar coincidencia parcial
  for (const [key, context] of Object.entries(DESTINATION_CONTEXTS)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return context
    }
  }

  // Inferir región por palabras clave
  let inferredRegion: DestinationContext['region'] = 'beach'
  if (normalized.includes('beach') || normalized.includes('playa')) inferredRegion = 'beach'
  else if (normalized.includes('mountain') || normalized.includes('ski')) inferredRegion = 'mountain'
  else if (normalized.includes('city') || normalized.includes('ciudad')) inferredRegion = 'city'

  // Retornar contexto genérico
  return {
    code: 'UNK',
    name: destinationName,
    country: 'Unknown',
    region: inferredRegion,
    visualElements: REGION_DEFAULTS[inferredRegion] || REGION_DEFAULTS.beach
  }
}

/**
 * Genera el prompt completo para la imagen de fondo
 * Combina: Contexto del Destino + Sentimiento de la Variante
 */
export function buildLayer1Prompt(
  destinationName: string,
  variantNumber: VariantNumber,
  aspectRatio: '1:1' | '9:16' | '4:5' = '4:5'
): string {
  const destination = getDestinationContext(destinationName)
  const sentiment = VARIANT_SENTIMENTS[variantNumber]

  // Aspect ratio instructions
  const aspectInstructions = {
    '1:1': 'Square format (1:1). Compose for Instagram feed.',
    '9:16': 'Vertical format (9:16). Compose for Instagram/TikTok stories. More vertical space.',
    '4:5': 'Portrait format (4:5). Compose for Instagram feed portrait.'
  }

  const prompt = `
Professional advertising photo for travel agency creative.

DESTINATION: ${destination.name}, ${destination.country}
VISUAL ELEMENTS: ${destination.visualElements}
${destination.seasonalNote ? `SEASONAL NOTE: ${destination.seasonalNote}` : ''}

PHOTOGRAPHY STYLE:
- Camera: ${sentiment.cameraStyle}
- Lighting: ${sentiment.lighting}
- Mood: ${sentiment.mood}

COMPOSITION:
${sentiment.composition}

MUST INCLUDE:
${sentiment.mustInclude}

TECHNICAL REQUIREMENTS:
- ${aspectInstructions[aspectRatio]}
- ${sentiment.technicalNote}
- High resolution, sharp focus on main elements
- Colors should be vibrant but natural
- Professional travel advertising quality

DO NOT INCLUDE:
- Text, logos, or watermarks on the image
- Cluttered or busy compositions
- Dark or moody atmospheres (unless specifically requested)
- Stock photo watermarks
`.trim()

  return prompt
}

/**
 * Genera múltiples prompts para todas las variantes de un destino
 */
export function buildAllVariantPrompts(
  destinationName: string,
  aspectRatio: '1:1' | '9:16' | '4:5' = '4:5'
): Record<VariantNumber, string> {
  return {
    1: buildLayer1Prompt(destinationName, 1, aspectRatio),
    2: buildLayer1Prompt(destinationName, 2, aspectRatio),
    3: buildLayer1Prompt(destinationName, 3, aspectRatio),
    4: buildLayer1Prompt(destinationName, 4, aspectRatio),
    5: buildLayer1Prompt(destinationName, 5, aspectRatio)
  }
}
