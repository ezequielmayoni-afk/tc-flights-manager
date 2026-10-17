/**
 * Configuración del módulo de posicionamiento (Fase 14: SEO + GEO).
 *
 * Acá viven las semillas que las migraciones siembran y los handlers leen:
 * las consultas que medimos en Google (SerpAPI), las preguntas que le hacemos
 * a los motores de IA y la lista de competidores que buscamos en sus
 * respuestas. Las tablas (`seo_keywords`, `geo_prompts`) mandan sobre estas
 * listas: esto es el valor inicial, no la verdad.
 */

/** Propiedad de Search Console (dominio: cubre www, blog, vuelos…). */
export const SEO_SITE = 'sc-domain:siviajo.com'
export const WWW_BASE = 'https://www.siviajo.com'
export const BLOG_BASE = 'https://blog.siviajo.com'

/** Proveedor de presupuesto para las sondas a motores de IA (una unidad = una pregunta). */
export const LLM_PROBE_PROVIDER = 'llm_probe'

export const GEO_ENGINES = ['chatgpt', 'gemini', 'claude'] as const
export type GeoEngine = (typeof GEO_ENGINES)[number]

export const GEO_ENGINE_LABELS: Record<GeoEngine, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  claude: 'Claude',
}

export type KeywordIntent = 'destino' | 'evento' | 'categoria' | 'informativo' | 'marca'

export interface SeedKeyword {
  keyword: string
  intent: KeywordIntent
  /** Página que debería rankear (relativa a www.siviajo.com o absoluta). Orienta, no se valida. */
  targetPath?: string
}

/**
 * Consultas que seguimos en Google Argentina. Salen de Search Console (lo que
 * ya trae impresiones) y de lo que rankean Almundo, TurismoCity, Viajobien y
 * Multitravel ("paquetes a {destino}"). Una llamada a SerpAPI por consulta y
 * por semana: 45 de las 250 diarias del presupuesto.
 */
export const SEED_KEYWORDS: SeedKeyword[] = [
  // Destinos (la intención comercial que hoy no capturamos)
  { keyword: 'paquetes a punta cana', intent: 'destino', targetPath: '/es/934/punta-cana/moreideas' },
  { keyword: 'paquetes a punta cana desde buenos aires', intent: 'destino', targetPath: '/es/934/punta-cana/moreideas' },
  { keyword: 'paquetes a bayahibe', intent: 'destino', targetPath: '/es/9537/bayahibe/moreideas' },
  { keyword: 'paquetes a bayahibe all inclusive 2027', intent: 'destino', targetPath: '/es/9537/bayahibe/moreideas' },
  { keyword: 'paquetes a cancun', intent: 'destino', targetPath: '/es/700/cancun/moreideas' },
  { keyword: 'paquetes a cancun desde argentina', intent: 'destino', targetPath: '/es/700/cancun/moreideas' },
  { keyword: 'paquetes a aruba', intent: 'destino', targetPath: '/es/12462/aruba/moreideas' },
  { keyword: 'paquetes a curazao', intent: 'destino', targetPath: '/es/12480/curazao/moreideas' },
  { keyword: 'paquetes a jamaica', intent: 'destino', targetPath: '/es/12450/jamaica/moreideas' },
  { keyword: 'paquetes al caribe desde argentina', intent: 'destino', targetPath: '/es/26/caribe/moreideas' },
  { keyword: 'paquetes al caribe all inclusive', intent: 'destino', targetPath: '/es/26/caribe/moreideas' },
  { keyword: 'paquetes a brasil 2027', intent: 'destino', targetPath: '/es/16/brasil/moreideas' },
  { keyword: 'paquetes a brasil verano 2027', intent: 'destino', targetPath: '/es/16/brasil/moreideas' },
  { keyword: 'paquetes a buzios', intent: 'destino', targetPath: '/es/3122/buzios/moreideas' },
  { keyword: 'paquetes a rio de janeiro', intent: 'destino', targetPath: '/es/937/rio-de-janeiro/moreideas' },
  { keyword: 'paquetes a florianopolis', intent: 'destino' },
  { keyword: 'paquetes a maceio', intent: 'destino' },
  { keyword: 'paquetes a porto seguro', intent: 'destino' },
  { keyword: 'paquetes a natal brasil', intent: 'destino' },
  { keyword: 'paquetes a porto de galinhas', intent: 'destino' },
  { keyword: 'paquetes a maragogi', intent: 'destino' },
  { keyword: 'paquetes a europa desde argentina', intent: 'destino', targetPath: '/es/79/europa/moreideas' },
  { keyword: 'salidas grupales a europa 2027', intent: 'destino', targetPath: '/es/17112/si-viajo-grupales/moreideas' },
  { keyword: 'paquetes a turquia y grecia', intent: 'destino' },
  { keyword: 'paquetes a dubai desde argentina', intent: 'destino' },
  { keyword: 'paquetes a egipto desde argentina', intent: 'destino' },
  { keyword: 'paquetes a disney desde argentina', intent: 'destino', targetPath: '/es/322/disney/moreideas' },
  // Eventos (donde ya rankeamos)
  { keyword: 'paquetes f1 brasil 2026', intent: 'evento', targetPath: '/es/1145/formula-1/moreideas' },
  { keyword: 'paquete interlagos 2026', intent: 'evento', targetPath: '/es/1145/formula-1/moreideas' },
  { keyword: 'paquetes gp mexico 2026', intent: 'evento', targetPath: '/es/1145/formula-1/moreideas' },
  { keyword: 'paquetes mundial 2026', intent: 'evento', targetPath: '/es/9654/mundial-2026/moreideas' },
  { keyword: 'paquetes rugby argentina', intent: 'evento', targetPath: '/es/14140/rugby/moreideas' },
  // Categoría (agencia + ciudad / confianza)
  { keyword: 'mejores agencias de viajes en argentina', intent: 'categoria', targetPath: '/' },
  { keyword: 'agencia de viajes buenos aires', intent: 'categoria', targetPath: '/' },
  { keyword: 'agencia de viajes confiable argentina', intent: 'categoria', targetPath: '/' },
  { keyword: 'agencia de viajes rosario', intent: 'categoria', targetPath: '/' },
  { keyword: 'agencia de viajes cordoba', intent: 'categoria', targetPath: '/' },
  { keyword: 'agencia de viajes paquetes en cuotas', intent: 'categoria', targetPath: '/' },
  // Informativo (lo que trae el blog)
  { keyword: 'mejor epoca para viajar a bayahibe', intent: 'informativo', targetPath: `${BLOG_BASE}/mejor-epoca-para-viajar-a-bayahibe-clima-lluvias-y-consejos-utiles/` },
  { keyword: 'clima bayahibe', intent: 'informativo', targetPath: `${BLOG_BASE}/mejor-epoca-para-viajar-a-bayahibe-clima-lluvias-y-consejos-utiles/` },
  { keyword: 'que hacer en aruba', intent: 'informativo' },
  { keyword: 'mejores playas de curazao', intent: 'informativo' },
  { keyword: 'mejor epoca para viajar a punta cana', intent: 'informativo' },
  { keyword: 'cuanto cuesta un viaje al caribe desde argentina', intent: 'informativo' },
  // Marca (control: tiene que dar 1)
  { keyword: 'si viajo agencia de viajes', intent: 'marca', targetPath: '/' },
]

export type GeoPromptCategory = 'recomendacion' | 'destino' | 'evento' | 'confianza' | 'marca'

export interface SeedGeoPrompt {
  prompt: string
  category: GeoPromptCategory
}

/**
 * Lo que un viajero argentino le pregunta a ChatGPT, Gemini o Claude. Cada
 * pregunta se hace una vez por semana a cada motor con búsqueda web activada,
 * en castellano rioplatense y con ubicación Argentina. Se mide si la respuesta
 * nombra a Sí, Viajo, si cita siviajo.com y qué competidores aparecen.
 */
export const SEED_GEO_PROMPTS: SeedGeoPrompt[] = [
  { prompt: '¿Cuáles son las mejores agencias de viajes de Argentina para comprar paquetes al Caribe?', category: 'recomendacion' },
  { prompt: 'Quiero viajar a Punta Cana desde Buenos Aires con todo incluido. ¿Qué agencia de viajes me recomendás?', category: 'destino' },
  { prompt: '¿Qué agencias de viajes argentinas son confiables y tienen buenas reseñas?', category: 'confianza' },
  { prompt: 'Recomendame una agencia de viajes de Buenos Aires para un paquete a Brasil en el verano 2027.', category: 'destino' },
  { prompt: '¿Dónde puedo comprar un paquete para ver la Fórmula 1 en Brasil 2026 desde Argentina?', category: 'evento' },
  { prompt: '¿Qué agencia de viajes ofrece salidas grupales acompañadas a Europa desde Argentina?', category: 'destino' },
  { prompt: 'Busco una agencia de viajes en Argentina con atención personalizada y asistencia 24 horas durante el viaje. ¿Cuál me conviene?', category: 'recomendacion' },
  { prompt: '¿Cuál es la mejor agencia de viajes de Rosario?', category: 'recomendacion' },
  { prompt: '¿Qué agencias de viajes de Argentina permiten pagar paquetes en cuotas?', category: 'recomendacion' },
  { prompt: '¿Cuál es la mejor época para viajar a Bayahibe y qué agencia argentina vende paquetes?', category: 'destino' },
  { prompt: 'Alternativas a Despegar y Almundo en Argentina para comprar paquetes de viaje.', category: 'recomendacion' },
  { prompt: '¿Sí, Viajo es una agencia de viajes confiable? ¿Qué dicen las reseñas?', category: 'marca' },
]

export interface Competitor {
  name: string
  /** Para detectar la mención en el texto (se compila sin distinguir mayúsculas). */
  pattern: RegExp
  /** Dominios citados que cuentan como ese competidor. */
  domains: string[]
}

/** Quiénes compiten por las mismas respuestas (lo que hoy cita el AI Overview y rankea en Google AR). */
export const COMPETITORS: Competitor[] = [
  { name: 'Despegar', pattern: /\bdespegar\b/i, domains: ['despegar.com.ar', 'despegar.com'] },
  { name: 'Almundo', pattern: /\balmundo\b/i, domains: ['almundo.com.ar', 'almundo.com'] },
  { name: 'TurismoCity', pattern: /\bturismo\s*city\b/i, domains: ['turismocity.com.ar'] },
  { name: 'Viajobien', pattern: /\bviajobien\b/i, domains: ['viajobien.com'] },
  { name: 'Multitravel', pattern: /\bmultitravel\b/i, domains: ['multitravel.com.ar'] },
  { name: 'Juliá Tours', pattern: /\bjuli[aá]\s*tours?\b/i, domains: ['juliatours.com.ar'] },
  { name: 'Costa Azul Viajes', pattern: /\bcosta\s*azul\b/i, domains: ['costaazulviajes.com.ar'] },
  { name: 'Buteler', pattern: /\bbuteler\b/i, domains: ['buteler.tur.ar'] },
  { name: 'Atrápalo', pattern: /\batr[aá]palo\b/i, domains: ['atrapalo.com.ar'] },
  { name: 'Avantrip', pattern: /\bavantrip\b/i, domains: ['avantrip.com'] },
  { name: 'Mejores Viajes', pattern: /\bmejores\s*viajes\b/i, domains: ['mejoresviajes.com.ar'] },
  { name: 'Ruta 40 Turismo', pattern: /\bruta\s*40\b/i, domains: ['ruta40turismo.com.ar'] },
  { name: 'Promociones Aéreas', pattern: /\bpromociones\s*a[eé]reas\b/i, domains: ['promociones-aereas.com.ar'] },
  { name: 'Deturista', pattern: /\bdeturista\b/i, domains: ['deturista.com'] },
  { name: 'Garbarino Viajes', pattern: /\bgarbarino\s*viajes\b/i, domains: ['garbarinoviajes.com.ar'] },
  { name: 'BA Viajes', pattern: /\bba\s*viajes\b/i, domains: ['baviajes.com.ar'] },
  { name: 'Tangol', pattern: /\btangol\b/i, domains: ['tangol.com'] },
  { name: 'Booking', pattern: /\bbooking\.com\b/i, domains: ['booking.com'] },
  { name: 'Expedia', pattern: /\bexpedia\b/i, domains: ['expedia.com', 'expedia.com.ar'] },
]
