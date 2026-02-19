/**
 * CAPA 3: MAPA DE ASSETS Y COMPOSICIÓN
 *
 * Esta capa actúa como el "inventario inteligente".
 * Define qué archivos PNG usar y cómo componerlos según la variante.
 *
 * El sistema selecciona assets basándose en:
 * 1. La variante elegida
 * 2. El contraste de la foto de fondo (claro/oscuro)
 */

import { VariantNumber } from './variants'

// ============================================
// DICCIONARIO DE ASSETS
// ============================================

export const ASSETS = {
  // CORE BRANDING
  logo_main: 'siviajo-logo.png',

  // Recurso "A" en diferentes colores
  recurso_a_white: 'A-01.png',   // Blanco - Para fondos oscuros o filtros azules
  recurso_a_green: 'A-02.png',   // Verde - Para acentos vibrantes
  recurso_a_cyan: 'A-03.png',    // Celeste - Para variantes de playa/cielo
  recurso_a_blue: 'A-04.png',    // Azul - Para fondos claros/blancos

  // UI CONTAINERS
  box_white: 'caja blanca para textos.png',  // Vital para legibilidad

  // ICONS & BADGES
  badge_flight: 'Copia de Copia de aereo.png',        // Círculo azul lleno
  badge_hotel: 'Copia de Copia de hotel.png',         // Círculo azul lleno
  icon_palm: 'Copia de Copia de ICONOS SI VIAJOP-08.png',
  icon_suitcase: 'Copia de Copia de ICONOS SI VIAJOP-05.png',

  // ARROWS
  arrow_triangle: 'Copia de Copia de flecha_1.png',
  arrow_curved: 'Copia de iconitos_Mesa de trabajo 1.png'
} as const

export type AssetKey = keyof typeof ASSETS

// ============================================
// COLORES DE MARCA
// ============================================

export const BRAND_COLORS = {
  primary_blue: '#1A237E',
  accent_green: '#1DE9B6',
  white: '#FFFFFF',
  black: '#000000'
}

// ============================================
// REGLAS DE COMPOSICIÓN POR VARIANTE
// ============================================

export interface CompositionRule {
  strategy: string
  background: {
    filter?: string       // Filtro opcional sobre la imagen
    overlay?: string      // Color de overlay con opacidad
  }
  recursoA: {
    variant: 'white' | 'green' | 'cyan' | 'blue'
    position: string
    size: 'small' | 'medium' | 'large' | 'xlarge'
    opacity: number       // 0-100
    rotation?: number     // Grados
  }
  container: {
    useWhiteBox: boolean
    position: string
  }
  badges: {
    show: boolean
    items: ('flight' | 'hotel')[]
    position: string
  }
  arrows: {
    show: boolean
    type: 'triangle' | 'curved'
    position: string
    pointsTo: string
  }
  logo: {
    position: 'top-center' | 'top-right' | 'top-left'
    margin: number        // px desde el borde
  }
  textLayout: {
    headline: {
      position: string
      alignment: 'left' | 'center' | 'right'
      color: string
    }
    price: {
      position: string
      size: 'giant' | 'large' | 'medium' | 'small'
      inSticker: boolean
      stickerColor?: string
    }
    sticker: {
      position: string
      shape: 'circle' | 'pill' | 'rectangle'
      color: string
    }
    cta: {
      position: string
      style: 'button' | 'text'
    }
  }
}

/**
 * Reglas de composición por variante
 */
export const COMPOSITION_RULES: Record<VariantNumber, CompositionRule> = {
  1: {
    // VARIANTE 1: OFERTA IMPACTO
    strategy: 'Usar caja blanca para garantizar que el precio se lea sobre cualquier foto',
    background: {
      overlay: 'rgba(0,0,0,0.1)'  // Leve oscurecimiento para contraste
    },
    recursoA: {
      variant: 'blue',
      position: 'bottom-right',
      size: 'xlarge',
      opacity: 100,
      rotation: -15
    },
    container: {
      useWhiteBox: true,
      position: 'center-left'
    },
    badges: {
      show: false,
      items: [],
      position: ''
    },
    arrows: {
      show: true,
      type: 'curved',
      position: 'outside-box-right',
      pointsTo: 'price'
    },
    logo: {
      position: 'top-center',
      margin: 50
    },
    textLayout: {
      headline: {
        position: 'inside-box-top',
        alignment: 'left',
        color: BRAND_COLORS.primary_blue
      },
      price: {
        position: 'inside-box-center',
        size: 'giant',
        inSticker: false,
        stickerColor: undefined
      },
      sticker: {
        position: 'inside-box-bottom',
        shape: 'pill',
        color: BRAND_COLORS.accent_green
      },
      cta: {
        position: 'bottom-center',
        style: 'text'
      }
    }
  },

  2: {
    // VARIANTE 2: EMOCIÓN (Marca de agua)
    strategy: 'Sutileza. La marca acompaña, no invade.',
    background: {
      filter: 'warm',  // Tonos cálidos
      overlay: 'rgba(0,0,0,0.2)'
    },
    recursoA: {
      variant: 'white',
      position: 'center',
      size: 'large',
      opacity: 35,  // Marca de agua elegante
      rotation: 0
    },
    container: {
      useWhiteBox: false,
      position: ''
    },
    badges: {
      show: false,
      items: [],
      position: ''
    },
    arrows: {
      show: false,
      type: 'curved',
      position: '',
      pointsTo: ''
    },
    logo: {
      position: 'top-center',
      margin: 50
    },
    textLayout: {
      headline: {
        position: 'center',
        alignment: 'center',
        color: BRAND_COLORS.white
      },
      price: {
        position: 'bottom-right',
        size: 'small',
        inSticker: true,
        stickerColor: BRAND_COLORS.primary_blue
      },
      sticker: {
        position: 'bottom-left',
        shape: 'pill',
        color: BRAND_COLORS.accent_green
      },
      cta: {
        position: 'bottom-center',
        style: 'text'
      }
    }
  },

  3: {
    // VARIANTE 3: DESTINO (Flecha direccional)
    strategy: 'Señalar el destino. La flecha dirige la atención.',
    background: {},
    recursoA: {
      variant: 'cyan',
      position: 'bottom-left',
      size: 'medium',
      opacity: 100,
      rotation: 10
    },
    container: {
      useWhiteBox: false,
      position: ''
    },
    badges: {
      show: true,
      items: ['flight', 'hotel'],
      position: 'bottom-right'
    },
    arrows: {
      show: true,
      type: 'triangle',
      position: 'next-to-title',
      pointsTo: 'destination-name'
    },
    logo: {
      position: 'top-right',
      margin: 50
    },
    textLayout: {
      headline: {
        position: 'top-third',
        alignment: 'left',
        color: BRAND_COLORS.white
      },
      price: {
        position: 'bottom-center',
        size: 'medium',
        inSticker: true,
        stickerColor: BRAND_COLORS.primary_blue
      },
      sticker: {
        position: 'below-headline',
        shape: 'pill',
        color: BRAND_COLORS.accent_green
      },
      cta: {
        position: 'bottom-center',
        style: 'button'
      }
    }
  },

  4: {
    // VARIANTE 4: CONVENIENCIA (Badges de servicio)
    strategy: 'Mostrar qué incluye usando los círculos azules.',
    background: {
      overlay: 'rgba(255,255,255,0.1)'  // Leve claridad para paz
    },
    recursoA: {
      variant: 'green',
      position: 'bottom-right',
      size: 'medium',
      opacity: 80,
      rotation: -10
    },
    container: {
      useWhiteBox: true,
      position: 'left'
    },
    badges: {
      show: true,
      items: ['flight', 'hotel'],
      position: 'inside-box-vertical'
    },
    arrows: {
      show: false,
      type: 'curved',
      position: '',
      pointsTo: ''
    },
    logo: {
      position: 'top-center',
      margin: 50
    },
    textLayout: {
      headline: {
        position: 'inside-box-top',
        alignment: 'left',
        color: BRAND_COLORS.primary_blue
      },
      price: {
        position: 'inside-box-bottom',
        size: 'medium',
        inSticker: false,
        stickerColor: undefined
      },
      sticker: {
        position: 'below-badges',
        shape: 'pill',
        color: BRAND_COLORS.accent_green
      },
      cta: {
        position: 'bottom-center',
        style: 'text'
      }
    }
  },

  5: {
    // VARIANTE 5: ESCASEZ (Contraste máximo)
    strategy: 'Usar colores de alerta. Bloque de color sólido para urgencia.',
    background: {
      overlay: 'rgba(26,35,126,0.4)'  // Overlay azul para urgencia
    },
    recursoA: {
      variant: 'green',
      position: 'left-half',
      size: 'xlarge',
      opacity: 90,
      rotation: 0
    },
    container: {
      useWhiteBox: false,
      position: ''
    },
    badges: {
      show: false,
      items: [],
      position: ''
    },
    arrows: {
      show: true,
      type: 'curved',
      position: 'pointing-to-cta',
      pointsTo: 'reservar-button'
    },
    logo: {
      position: 'top-center',
      margin: 50
    },
    textLayout: {
      headline: {
        position: 'on-color-block',
        alignment: 'center',
        color: BRAND_COLORS.white
      },
      price: {
        position: 'below-headline',
        size: 'large',
        inSticker: true,
        stickerColor: BRAND_COLORS.accent_green
      },
      sticker: {
        position: 'top-of-color-block',
        shape: 'rectangle',
        color: BRAND_COLORS.primary_blue
      },
      cta: {
        position: 'bottom-center',
        style: 'button'
      }
    }
  }
}

// ============================================
// LÓGICA DE VALIDACIÓN
// ============================================

export interface ValidationResult {
  isValid: boolean
  warnings: string[]
  adjustments: {
    recursoAVariant?: 'white' | 'blue'
    forceWhiteBox?: boolean
  }
}

/**
 * Valida y ajusta la composición según el brillo del fondo
 *
 * @param variantNumber - Número de variante (1-5)
 * @param backgroundLuminosity - Luminosidad del fondo (0-255)
 */
export function validateComposition(
  variantNumber: VariantNumber,
  backgroundLuminosity: number
): ValidationResult {
  const result: ValidationResult = {
    isValid: true,
    warnings: [],
    adjustments: {}
  }

  const rule = COMPOSITION_RULES[variantNumber]

  // Check de "A": Si el fondo es muy claro, forzar azul. Si es oscuro, usar blanco.
  if (backgroundLuminosity > 200) {
    if (rule.recursoA.variant !== 'blue') {
      result.warnings.push('Fondo muy claro detectado. Ajustando recurso A a azul.')
      result.adjustments.recursoAVariant = 'blue'
    }
  } else if (backgroundLuminosity < 100) {
    if (rule.recursoA.variant !== 'white' && rule.recursoA.opacity === 100) {
      result.warnings.push('Fondo oscuro detectado. Considerando recurso A blanco.')
      result.adjustments.recursoAVariant = 'white'
    }
  }

  // Check de Caja: Si es variante 1 o 4 y no tiene caja, forzarla
  if ((variantNumber === 1 || variantNumber === 4) && !rule.container.useWhiteBox) {
    result.warnings.push('Variante requiere caja blanca para legibilidad.')
    result.adjustments.forceWhiteBox = true
  }

  return result
}

/**
 * Obtiene los assets necesarios para una variante
 */
export function getVariantAssets(variantNumber: VariantNumber): {
  required: AssetKey[]
  optional: AssetKey[]
} {
  const rule = COMPOSITION_RULES[variantNumber]
  const required: AssetKey[] = ['logo_main']
  const optional: AssetKey[] = []

  // Agregar recurso A según variante
  const recursoAMap: Record<string, AssetKey> = {
    white: 'recurso_a_white',
    green: 'recurso_a_green',
    cyan: 'recurso_a_cyan',
    blue: 'recurso_a_blue'
  }
  required.push(recursoAMap[rule.recursoA.variant])

  // Agregar caja blanca si es necesaria
  if (rule.container.useWhiteBox) {
    required.push('box_white')
  }

  // Agregar badges si se muestran
  if (rule.badges.show) {
    if (rule.badges.items.includes('flight')) required.push('badge_flight')
    if (rule.badges.items.includes('hotel')) required.push('badge_hotel')
  }

  // Agregar flechas si se muestran
  if (rule.arrows.show) {
    if (rule.arrows.type === 'triangle') required.push('arrow_triangle')
    if (rule.arrows.type === 'curved') required.push('arrow_curved')
  }

  // Assets opcionales (iconos decorativos)
  optional.push('icon_palm', 'icon_suitcase')

  return { required, optional }
}

/**
 * Genera las instrucciones de composición para el prompt de Gemini
 */
export function buildCompositionInstructions(
  variantNumber: VariantNumber,
  backgroundLuminosity?: number
): string {
  const rule = COMPOSITION_RULES[variantNumber]
  const validation = backgroundLuminosity !== undefined
    ? validateComposition(variantNumber, backgroundLuminosity)
    : { isValid: true, warnings: [], adjustments: {} as ValidationResult['adjustments'] }

  const recursoAVariant = validation.adjustments.recursoAVariant || rule.recursoA.variant
  const useWhiteBox = validation.adjustments.forceWhiteBox || rule.container.useWhiteBox

  return `
COMPOSITION STRATEGY: ${rule.strategy}

VISUAL ELEMENTS TO INCLUDE:
1. LOGO: Position at ${rule.logo.position}, ${rule.logo.margin}px margin from edge

2. BRAND ELEMENT "A":
   - Color variant: ${recursoAVariant.toUpperCase()}
   - Position: ${rule.recursoA.position}
   - Size: ${rule.recursoA.size}
   - Opacity: ${rule.recursoA.opacity}%
   ${rule.recursoA.rotation ? `- Rotation: ${rule.recursoA.rotation} degrees` : ''}

${useWhiteBox ? `3. WHITE TEXT BOX:
   - Position: ${rule.container.position}
   - Purpose: Ensure text readability over any background
` : ''}

${rule.badges.show ? `4. SERVICE BADGES:
   - Show: ${rule.badges.items.join(', ')}
   - Position: ${rule.badges.position}
   - Style: Blue filled circles with white icons
` : ''}

${rule.arrows.show ? `5. DIRECTIONAL ARROW:
   - Type: ${rule.arrows.type}
   - Position: ${rule.arrows.position}
   - Points to: ${rule.arrows.pointsTo}
` : ''}

TEXT LAYOUT:
- Headline: ${rule.textLayout.headline.position}, ${rule.textLayout.headline.alignment} aligned, color ${rule.textLayout.headline.color}
- Price: ${rule.textLayout.price.position}, size ${rule.textLayout.price.size}${rule.textLayout.price.inSticker ? `, inside ${rule.textLayout.price.stickerColor} sticker` : ''}
- Sticker/Badge: ${rule.textLayout.sticker.position}, ${rule.textLayout.sticker.shape} shape, color ${rule.textLayout.sticker.color}
- CTA: ${rule.textLayout.cta.position}, style ${rule.textLayout.cta.style}

BRAND COLORS:
- Primary Blue: ${BRAND_COLORS.primary_blue}
- Accent Green: ${BRAND_COLORS.accent_green}
- White: ${BRAND_COLORS.white}

TYPOGRAPHY: Montserrat family (Bold for headlines, Regular for body)
`.trim()
}
