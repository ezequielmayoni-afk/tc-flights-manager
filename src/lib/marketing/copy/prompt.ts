import { ANGLES, BRAND_VOICE, CORE_INSIGHT, DIFFERENTIATORS, EMOTIONAL_LEVERS, GUILT_DEACTIVATORS, type Angle } from '../brand'
import { LIMITS } from './qa'
import type { CopyPackageData } from './types'

const fmtPrice = (n: number | null, currency: string) => (n === null ? 'sin precio' : `${currency} ${Math.round(n).toLocaleString('es-AR')} por persona`)
const fmtDate = (d: string | null) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : null)

export function buildCopySystemPrompt(): string {
  return [
    `Sos el copywriter de ${BRAND_VOICE.name} ("${BRAND_VOICE.tagline}"), una agencia de viajes argentina. Escribís anuncios de Meta (feed e historias) cuyo botón abre WhatsApp. Español rioplatense, siempre "vos".`,
    '',
    '== VOZ ==',
    `Personalidad: ${BRAND_VOICE.personality.join(' · ')}.`,
    `Marca: ${BRAND_VOICE.linguistic.pronounBrand}. Cliente: ${BRAND_VOICE.linguistic.pronounClient}. Verbos: ${BRAND_VOICE.linguistic.verbForms}.`,
    `Frases de calidez: ${BRAND_VOICE.linguistic.warmthPatterns.join(' / ')}. Palabras de marca: ${BRAND_VOICE.keywords.join(', ')}.`,
    `Nunca: ${BRAND_VOICE.neverBe.join(', ')}. Prohibido: ${BRAND_VOICE.forbidden.join(', ')}.`,
    `Insight central: ${CORE_INSIGHT}`,
    '',
    '== PALANCAS DEL VIAJERO ARGENTINO (usá al menos una por copy) ==',
    ...EMOTIONAL_LEVERS.map(l => `- ${l.name}: ${l.description}`),
    'Desactivadores de culpa: ' + GUILT_DEACTIVATORS.map(g => `${g.technique} ("${g.example}")`).join(' · '),
    '',
    '== DIFERENCIADORES (usá uno por copy, nunca inventes ventajas) ==',
    ...DIFFERENTIATORS.map(d => `- ${d.name}: ${d.copyAngle}`),
    '',
    '== REGLAS DURAS ==',
    `- primary_text: los primeros ${LIMITS.primaryHook} caracteres son el gancho (lo que se ve antes de "Ver más"). Si no atrapa ahí, perdiste. Máximo ${LIMITS.primaryMax} caracteres, 2 a 4 párrafos cortos, emojis con moderación (máximo 3).`,
    `- headline: máximo ${LIMITS.headline} caracteres. description: máximo ${LIMITS.description}.`,
    '- Los nombres de lugares van en español y con tildes (Florianópolis, Cancún, Río de Janeiro, Punta Cana), aunque te los pase sin tilde o en inglés.',
    '- Datos: sólo los que te doy. No inventes precio, noches, hotel, fechas, lugares ni "cuotas sin interés". Si un dato no está, no lo nombres.',
    '- Si el paquete NO es de cupo, no hables de "últimos lugares" ni de cupos. Si es de cupo, podés decir exactamente cuántos quedan.',
    '- Nada de engagement bait (etiquetá, comentá, compartí), nada en mayúsculas sostenidas, nada de "garantizado", "gratis" ni atributos personales del lector.',
    '- Cada ángulo tiene que sonar distinto: distinto gancho, distinta palanca, distinto diferenciador.',
    '- Cerrá siempre con una invitación a escribir por WhatsApp (el botón del anuncio abre el chat).',
    '',
    'Respondé SOLO con JSON válido: {"copies":[{"variant":1,"angle":"oferta","primary_text":"...","headline":"...","description":"..."}, ...]}',
  ].join('\n')
}

export function buildCopyUserPrompt(pkg: CopyPackageData, angles: Angle[] = ANGLES): string {
  const inc = [pkg.includes.flights && 'aéreo', pkg.includes.hotel && 'hotel', pkg.includes.transfers && 'traslados', pkg.includes.tours && 'excursiones', pkg.includes.tickets && 'entradas'].filter(Boolean).join(', ')
  const lines = [
    '== PAQUETE (fuente de verdad) ==',
    `Título en siviajo.com: ${pkg.title}`,
    `Destino: ${pkg.destinations.join(' + ') || pkg.primaryDestination}${pkg.family ? ` (familia ${pkg.family})` : ''}`,
    `Precio: ${fmtPrice(pkg.pricePerPax, pkg.currency)}${pkg.adults ? ` (base ${pkg.adults} adulto${pkg.adults === 1 ? '' : 's'}${pkg.children ? ` + ${pkg.children} menor${pkg.children === 1 ? '' : 'es'}` : ''})` : ''}`,
    pkg.nights ? `Noches: ${pkg.nights}` : null,
    pkg.hotelName ? `Hotel: ${pkg.hotelName}${pkg.hotelStars ? ` (${pkg.hotelStars} estrellas)` : ''}${pkg.boardName ? `, régimen ${pkg.boardName}` : ''}` : null,
    inc ? `Incluye: ${inc}` : null,
    pkg.departureDate ? `Salida: ${fmtDate(pkg.departureDate)}${pkg.originCity ? ` desde ${pkg.originCity}` : ''}` : pkg.dateRangeStart ? `Fechas: del ${fmtDate(pkg.dateRangeStart)} al ${fmtDate(pkg.dateRangeEnd)}` : null,
    pkg.airline ? `Aerolínea: ${pkg.airline}${pkg.directFlight === true ? ', vuelo directo' : pkg.directFlight === false ? ', con escala' : ''}` : null,
    pkg.cupoRemaining !== null ? `Es CUPO propio: quedan ${pkg.cupoRemaining} lugares (dato real, podés usarlo)` : 'Es tarifa de sistema: NO hables de cupos ni de últimos lugares',
    pkg.isOperatorDeparture ? 'Es una salida grupal acompañada' : null,
    pkg.themes.length ? `Temáticas: ${pkg.themes.join(', ')}` : null,
    '',
    '== ÁNGULOS A ESCRIBIR (un copy por cada uno, en este orden) ==',
    ...angles.map(a => `${a.variant}. ${a.key} · ${a.name}: ${a.description}. Tono: ${a.tone} Ejemplo de gancho: "${a.exampleHook}". Títulos posibles: ${a.headlineTemplates.map(h => h.replace('{destino}', pkg.primaryDestination.toUpperCase())).join(' / ')}.`),
  ]
  return lines.filter((l): l is string => l !== null).join('\n')
}
