/**
 * Voz de marca de sí,viAjo. Portado de siviajo-media-os (src/agents/brand/*)
 * el 2026-10-14 para el motor de copys de la Fase 5. Es la única fuente para
 * todo texto que genera HUB (anuncios, mensajes, briefs).
 */

export const BRAND_VOICE = {
  name: 'sí,viAjo',
  tagline: 'Es la respuesta',
  personality: ['Cómplice: está de tu lado, te entiende', 'Inspiradora: te mueve, te da ganas', 'Curiosa: descubre, propone, sugiere', 'Resolutiva: te da una decisión, no más dudas'],
  linguistic: {
    pronounBrand: 'nosotros ("nosotros nos ocupamos")',
    pronounClient: 'vos ("vos relajate")',
    verbForms: 'Aprovechá, Reservá, Viajá, Decí, Imaginá, Elegí, Descubrí',
    warmthPatterns: ['Te recomendamos específicamente esto', 'En base a lo que buscás', 'Nosotros nos ocupamos, vos disfrutás', 'Alguien se hace cargo'],
  },
  keywords: ['Sí', 'Decí que sí', 'Tu próximo sí', 'Ofertas que sí'],
  forbidden: ['usted', 'estimado', 'estimada', 'vale', 'tío', 'mola', 'boludo', 'corporativo', 'flipante', 'guay'],
  neverBe: ['excesivamente dulce', 'intrusiva', 'impositiva', 'sabelotodo', 'cursi', 'exagerada', 'genérica'],
} as const

export type AngleKey = 'oferta' | 'emocion' | 'destino' | 'conveniencia' | 'escasez'

export interface Angle {
  /** Número de variante en meta_ad_copies (1..5), el mismo orden que usaba el sistema viejo de variantes. */
  variant: 1 | 2 | 3 | 4 | 5
  key: AngleKey
  name: string
  objective: string
  description: string
  tone: string
  exampleHook: string
  headlineTemplates: string[]
  ctaOptions: string[]
}

export const ANGLES: Angle[] = [
  { variant: 1, key: 'oferta', name: 'Precio / Oferta', objective: 'Racional y urgente', description: 'Urgencia por valor, oportunidad única, "este precio no dura"', tone: 'Directo y decidido. Urgencia por valor.', exampleHook: 'Este precio no se repite: Punta Cana con todo incluido por USD 1.889.', headlineTemplates: ['OFERTA FLASH', 'PRECIO ÚNICO', 'OPORTUNIDAD', '¡BAJÓ EL PRECIO!', 'OFERTA IMPERDIBLE'], ctaOptions: ['Reservá ahora', 'No lo pienses más', 'Aprovechá ya', 'Decí que sí'] },
  { variant: 2, key: 'emocion', name: 'Experiencia / Emoción', objective: 'Inspiracional y sensorial', description: 'Apelar al deseo, escaparse, imaginarse ahí', tone: 'Cálido, propositivo y apasionado. Preguntas que invitan a soñar.', exampleHook: '¿Te imaginás acá? Tu próximo sí está esperando.', headlineTemplates: ['¿Te imaginás acá?', 'Vivilo vos mismo', 'Tu próximo sí', 'Escapate', '¿Y si decís que sí?'], ctaOptions: ['Empezá a soñar', 'Decí que sí', 'Reservá tu escape', 'Viví la experiencia'] },
  { variant: 3, key: 'destino', name: 'Destino', objective: 'Informativo e icónico', description: 'Destacar lo único e irresistible del lugar', tone: 'Cómplice y experto. "Conocé lo mejor del Caribe".', exampleHook: 'Descubrí lo que Punta Cana guarda para los que se animan.', headlineTemplates: ['{destino}', 'DESCUBRÍ {destino}', '{destino} TE ESPERA', 'CONOCÉ {destino}'], ctaOptions: ['Conocé más', 'Explorá', 'Descubrilo', 'Reservá tu viaje'] },
  { variant: 4, key: 'conveniencia', name: 'Conveniencia', objective: 'Seguridad y facilidad', description: 'Todo resuelto, cero estrés, viajar fácil', tone: 'Resolutivo y confiable. "Nosotros nos ocupamos".', exampleHook: 'Vuelo, hotel y traslados resueltos. Vos sólo hacés la valija.', headlineTemplates: ['TODO RESUELTO', 'SOLO DISFRUTÁ', 'VIAJÁ SIN VUELTAS', 'CERO ESTRÉS', 'NOSOTROS NOS OCUPAMOS'], ctaOptions: ['Consultá ahora', 'Pedí tu presupuesto', 'Viajá tranquilo', 'Dejalo en nuestras manos'] },
  { variant: 5, key: 'escasez', name: 'Escasez', objective: 'Acción inmediata', description: 'Últimos lugares, cupos reales, decisión ahora', tone: 'Directo, decidido y desafiante. La urgencia es real, no fabricada: precio y cupos hablan solos.', exampleHook: 'Quedan 4 lugares para el 13 de febrero. ¿Te lo vas a perder?', headlineTemplates: ['¡ÚLTIMOS LUGARES!', 'SE TERMINA', '¡ÚLTIMOS CUPOS!', 'NO TE LO PIERDAS', 'AHORA O NUNCA'], ctaOptions: ['¡Reservá ya!', 'No te quedes afuera', 'Asegurá tu lugar', '¿Te lo vas a perder?'] },
]

export const ANGLE_BY_VARIANT: Record<number, Angle> = Object.fromEntries(ANGLES.map(a => [a.variant, a]))

export interface Differentiator { id: string; name: string; description: string; copyAngle: string }

export const DIFFERENTIATORS: Differentiator[] = [
  { id: 'asesoramiento', name: 'Asesoramiento personalizado', description: 'Un experto humano te escucha, entiende qué buscás y te recomienda una opción con convicción, no cuatro presupuestos genéricos.', copyAngle: 'Nosotros nos ocupamos, vos disfrutás. Alguien que te entiende está detrás de cada reserva.' },
  { id: 'curados', name: 'Paquetes curados con criterio', description: 'No publicamos todo. Elegimos los paquetes que valen la pena: hotel correcto, precio justo, fecha con sentido.', copyAngle: 'Ya lo elegimos nosotros. Sólo te queda decir que sí.' },
  { id: 'expertise', name: 'Expertise en el destino', description: 'Sabemos qué hotel de la zona vale más, cuál tiene el mejor all inclusive, cuándo ir y cuándo evitar.', copyAngle: 'Conocemos el destino. Sabemos exactamente qué te conviene y por qué.' },
  { id: 'humano_local', name: 'Atención humana rioplatense', description: 'Equipo local que habla como vos. Sin callcenters, sin bots, sin esperas de 48 horas.', copyAngle: 'Hablás con alguien que viajó, que sabe, que está acá.' },
  { id: 'precio_transparente', name: 'Precio total y transparente', description: 'El precio que se muestra es el precio real. Sin sorpresas de último momento ni tasas ocultas.', copyAngle: 'Este es el precio. Total. Sin letra chica.' },
]

export const EMOTIONAL_LEVERS = [
  { id: 'escapar', name: 'Escapar', description: 'Necesito salir de acá: el estrés, el frío, la rutina. El viaje es la válvula de escape.' },
  { id: 'merecer', name: 'Merecer', description: 'Laburé todo el año para esto. "Me lo merezco, lo gané."' },
  { id: 'fomo', name: 'FOMO', description: 'Si no reservo ahora me lo pierdo: el cupo real, el precio que vence, la salida que se llena.' },
  { id: 'seguridad', name: 'Seguridad', description: 'Viajo tranquilo porque alguien se ocupa. Lo humano frente a la compra online fría.' },
  { id: 'compartir', name: 'Compartir', description: 'Mirá adónde vamos. El viaje como experiencia social: familia, pareja, amigos.' },
  { id: 'sonar', name: 'Soñar', description: 'Quiero eso. El click impulsivo del sillón, el deseo que venía reprimiendo.' },
] as const

export const GUILT_DEACTIVATORS = [
  { id: 'precio_por_noche', technique: 'Precio por noche', example: 'Son USD 120 por noche con todo incluido: comida, bebida y hotel.' },
  { id: 'cuotas', technique: 'Cuotas', example: 'Lo pagás en cuotas, sin vueltas.' },
  { id: 'todo_incluido', technique: 'Todo incluido = sin gasto extra', example: 'Todo incluido: no sacás la billetera en todo el viaje.' },
  { id: 'urgencia_real', technique: 'Urgencia real de precio o cupo', example: 'Quedan 4 lugares. En Argentina la urgencia de cupo es creíble cuando es cierta.' },
] as const

export const CORE_INSIGHT = 'Tu cliente no muere porque no quiere comprar. Muere porque nadie lo ayudó a terminar de decidir. El anuncio tiene que reducir la fricción emocional hasta que el "sí" sea el camino de menor resistencia.'
