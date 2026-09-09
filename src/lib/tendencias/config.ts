/**
 * Configuración del agente Tendencias.
 *
 * Los destinos semilla dan la región y aseguran continuidad semana a semana;
 * el descubrimiento real lo hace Autocomplete (puede aparecer cualquier
 * destino que los argentinos estén escribiendo en Google).
 */

export const DESTINATION_SEEDS: Record<string, string[]> = {
  caribe: [
    'Caribe', 'Cancún', 'Punta Cana', 'Bayahibe', 'Puerto Plata', 'Riviera Maya', 'Aruba', 'Curaçao',
    'Cartagena', 'San Andrés', 'Jamaica', 'Playa del Carmen', 'La Habana', 'Cuba', 'Bahamas', 'Panamá',
    'México', 'Costa Rica', 'Colombia',
  ],
  europa: [
    'Roma', 'París', 'Barcelona', 'Madrid', 'Londres', 'Lisboa',
    'Amsterdam', 'Praga', 'Estambul', 'Turquía', 'Grecia', 'Croacia',
    'Portugal', 'Santorini', 'Italia', 'España', 'Canarias', 'Europa',
  ],
  eeuu: [
    'Estados Unidos', 'Miami', 'Orlando', 'Nueva York', 'Las Vegas', 'Los Ángeles', 'Disney',
  ],
  brasil: [
    'Brasil', 'Rio de Janeiro', 'Florianópolis', 'Salvador de Bahía',
    'Buzios', 'Maragogi', 'Porto de Galinhas', 'Natal', 'Maceió', 'Porto Seguro', 'Pipa',
  ],
  sudamerica: [
    'Cusco', 'Machu Picchu', 'Perú', 'Chile', 'Santiago de Chile', 'Bogotá', 'Lima',
    'Uruguay', 'Montevideo', 'Punta del Este',
  ],
  argentina: [
    'Bariloche', 'Mendoza', 'Ushuaia', 'Iguazú', 'Córdoba',
    'Salta', 'El Calafate', 'Mar del Plata', 'Carlos Paz',
  ],
  ski: [
    'Valle Nevado', 'Portillo', 'Cerro Catedral', 'Chapelco', 'Aspen',
  ],
  exotico: [
    'Tailandia', 'Maldivas', 'Japón', 'Bali', 'Dubai', 'Egipto', 'Marruecos',
    'Sudáfrica', 'Kenia', 'Australia', 'China', 'Corea del Sur', 'Vietnam',
  ],
}

/**
 * Cómo se llama cada destino en Travel Compositor (package_destinations
 * viene en inglés o con el nombre de la ciudad) — slugs. Un país semilla
 * (Grecia, Tailandia…) matchea con cualquiera de sus ciudades.
 */
export const DESTINATION_ALIASES: Record<string, string[]> = {
  'caribe': ['punta-cana', 'bayahibe', 'la-romana', 'puerto-plata', 'cancun', 'costa-mujeres', 'playa-del-carmen', 'tulum', 'aruba', 'curacao', 'montego-bay', 'negril', 'nassau', 'cayman-islands', 'san-andres', 'cartagena', 'havana', 'varadero', 'virgin-gorda', 'samana'],
  'cuba': ['havana', 'la-habana', 'varadero'],
  'mexico': ['cancun', 'costa-mujeres', 'playa-del-carmen', 'tulum', 'riviera-maya', 'los-cabos', 'puerto-vallarta', 'mexico-city', 'ciudad-de-mexico'],
  'costa-rica': ['san-jose', 'guanacaste', 'costa-rica'],
  'colombia': ['cartagena', 'san-andres', 'bogota', 'medellin', 'santa-marta'],
  'brasil': ['rio-de-janeiro', 'buzios', 'florianopolis', 'maceio', 'maragogi', 'natal', 'pipa', 'porto-de-galinhas', 'porto-seguro', 'salvador', 'praia-do-forte', 'costa-do-sauipe', 'imbassai', 'sao-paulo', 'fortaleza', 'recife', 'jericoacoara'],
  'chile': ['santiago', 'valle-nevado', 'portillo', 'san-pedro-de-atacama', 'puerto-varas', 'vina-del-mar'],
  'santiago-de-chile': ['santiago'],
  'peru': ['lima', 'cusco', 'sacred-valley', 'aguas-calientes', 'arequipa', 'puno'],
  'uruguay': ['montevideo', 'punta-del-este', 'colonia'],
  'estados-unidos': ['miami', 'orlando', 'new-york', 'las-vegas', 'los-angeles', 'walt-disney-world', 'austin', 'chicago', 'san-francisco', 'washington'],
  'espana': ['madrid', 'barcelona', 'sevilla', 'malaga', 'valencia', 'ibiza', 'mallorca', 'tenerife', 'gran-canaria', 'granada', 'bilbao'],
  'canarias': ['tenerife', 'gran-canaria', 'lanzarote', 'fuerteventura'],
  'cordoba': ['cordoba', 'carlos-paz', 'villa-general-belgrano', 'la-cumbrecita'],
  'carlos-paz': ['carlos-paz', 'villa-carlos-paz'],
  'iguazu': ['puerto-iguazu', 'iguazu', 'foz-do-iguacu'],
  'roma': ['rome'],
  'paris': ['paris'],
  'londres': ['london'],
  'lisboa': ['lisbon'],
  'estambul': ['istanbul'],
  'turquia': ['istanbul', 'cappadocia', 'pamukkale', 'kusadasi', 'ankara', 'canakkale'],
  'grecia': ['athens', 'mykonos', 'santorini', 'samos', 'crete', 'rhodes'],
  'santorini': ['santorini'],
  'croacia': ['dubrovnik', 'split', 'zagreb'],
  'portugal': ['lisbon', 'porto', 'algarve'],
  'italia': ['rome', 'florence', 'venice', 'milan', 'naples', 'sicily', 'salerno', 'genova', 'amalfi'],
  'europa': ['rome', 'paris', 'madrid', 'barcelona', 'london', 'amsterdam', 'prague', 'vienna', 'budapest', 'berlin', 'munich', 'lisbon', 'florence', 'venice', 'brussels', 'bruges', 'zurich', 'dublin', 'frankfurt', 'heidelberg', 'bordeaux', 'cote-d-azur', 'milan', 'naples'],
  'amsterdam': ['amsterdam'],
  'praga': ['prague'],
  'nueva-york': ['new-york'],
  'los-angeles': ['los-angeles'],
  'disney': ['walt-disney-world', 'disney', 'orlando'],
  'orlando': ['orlando'],
  'las-vegas': ['las-vegas'],
  'cancun': ['cancun', 'costa-mujeres'],
  'riviera-maya': ['playa-del-carmen', 'tulum', 'akumal', 'riviera-maya'],
  'punta-cana': ['punta-cana', 'bavaro'],
  'bayahibe': ['bayahibe', 'la-romana'],
  'jamaica': ['montego-bay', 'negril', 'ocho-rios', 'jamaica'],
  'bahamas': ['nassau', 'bahamas'],
  'panama': ['panama-city', 'panama'],
  'la-habana': ['havana', 'la-habana', 'varadero'],
  'cartagena': ['cartagena'],
  'san-andres': ['san-andres'],
  'rio-de-janeiro': ['rio-de-janeiro'],
  'buzios': ['buzios'],
  'florianopolis': ['florianopolis'],
  'salvador-de-bahia': ['salvador', 'praia-do-forte', 'costa-do-sauipe', 'imbassai'],
  'maceio': ['maceio'],
  'natal': ['natal'],
  'pipa': ['pipa'],
  'machu-picchu': ['aguas-calientes', 'cusco', 'sacred-valley'],
  'cusco': ['cusco', 'sacred-valley', 'aguas-calientes'],
  'lima': ['lima'],
  'bariloche': ['san-carlos-de-bariloche', 'bariloche'],
  'cerro-catedral': ['san-carlos-de-bariloche'],
  'el-calafate': ['el-calafate'],
  'tailandia': ['bangkok', 'phuket', 'chiang-mai', 'krabi', 'koh-samui'],
  'japon': ['tokyo', 'kyoto', 'osaka', 'hiroshima', 'nagano', 'kobe', 'fukuoka'],
  'egipto': ['cairo', 'luxor', 'aswan', 'edfu', 'hurghada', 'sharm-el-sheikh'],
  'marruecos': ['marrakech', 'casablanca', 'fez', 'rabat'],
  'sudafrica': ['cape-town', 'johannesburg', 'kruger-national-park', 'knysna', 'oudtshoorn'],
  'kenia': ['nairobi', 'maasai-mara', 'lake-nakuru', 'aberdare-national-park'],
  'australia': ['sydney', 'melbourne', 'adelaide', 'brisbane', 'gold-coast'],
  'china': ['beijing', 'shanghai', 'xi-an', 'chengdu'],
  'corea-del-sur': ['seoul', 'busan', 'jeonju'],
  'vietnam': ['hanoi', 'ho-chi-minh', 'ha-long'],
  'maldivas': ['maldives', 'male'],
  'bali': ['bali', 'denpasar', 'ubud'],
  'dubai': ['dubai'],
}

/**
 * Variantes con las que la gente escribe un mismo destino → slug canónico
 * (el de la semilla). Se aplica al descubrir, así las menciones se suman.
 */
export const CANONICAL_SLUGS: Record<string, string> = {
  'curazao': 'curacao',
  'rio': 'rio-de-janeiro',
  'floripa': 'florianopolis',
  'new-york': 'nueva-york',
  'ny': 'nueva-york',
  'usa': 'estados-unidos',
  'eeuu': 'estados-unidos',
  'ee-uu': 'estados-unidos',
  'miami-beach': 'miami',
  'orlando-disney': 'disney',
  'disney-orlando': 'disney',
  'disneyworld': 'disney',
  'disneyland': 'disney',
  'walt-disney': 'disney',
  'punta-cana-republica-dominicana': 'punta-cana',
  'republica-dominicana': 'punta-cana',
  'cataratas-del-iguazu': 'iguazu',
  'cataratas': 'iguazu',
  'puerto-iguazu': 'iguazu',
  'san-carlos-de-bariloche': 'bariloche',
  'villa-carlos-paz': 'carlos-paz',
  'el-caribe': 'caribe',
  'mexico-cancun': 'cancun',
  'cancun-mexico': 'cancun',
  'machupicchu': 'machu-picchu',
  'machu-pichu': 'machu-picchu',
  'peru-machu-picchu': 'machu-picchu',
  'santiago': 'santiago-de-chile',
  'salvador': 'salvador-de-bahia',
  'salvador-bahia': 'salvador-de-bahia',
  'estambul-turquia': 'estambul',
  'tokio': 'japon',
  'grecia-santorini': 'santorini',
  'islas-canarias': 'canarias',
  'dubai-emiratos': 'dubai',
  'emiratos': 'dubai',
  'san-andres-colombia': 'san-andres',
  'san-andres-islas': 'san-andres',
  'san-pablo': 'sao-paulo',
  'punta-cana-2026': 'punta-cana',
  'punta-cana-2027': 'punta-cana',
}

export interface SeedDestination {
  name: string
  slug: string
  region: string
}

export function getAllDestinations(): SeedDestination[] {
  const all: SeedDestination[] = []
  for (const [region, destinations] of Object.entries(DESTINATION_SEEDS)) {
    for (const name of destinations) {
      all.push({ name, slug: slugify(name), region })
    }
  }
  return all
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Plantillas que se comparan en Google Trends para cada destino. Trends
 * matchea todas las búsquedas que contienen esas palabras en cualquier orden:
 * "paquetes brasil" incluye "paquetes a brasil desde córdoba".
 */
export const TRENDS_TEMPLATES = ['paquetes {d}', 'viaje {d}', 'vuelos {d}'] as const

/** Plantilla para pedir las consultas relacionadas de un destino (intención de compra). */
export const TRENDS_RELATED_TEMPLATE = 'paquetes {d}'

/**
 * Términos genéricos cuyas consultas relacionadas (top y en alza) revelan
 * qué destinos se buscan y con qué volumen relativo, sin lista previa.
 */
export const GENERIC_TREND_SEEDS = ['paquetes', 'viajes', 'vuelos', 'vacaciones', 'all inclusive', 'escapadas', 'crucero']

/**
 * Pesos del score compuesto. Se reparten sólo entre las fuentes que
 * respondieron en la corrida, así una fuente caída no hunde a todos.
 * Sólo demanda de mercado: nada de siviajo.com.
 */
export const SOURCE_WEIGHTS: Record<string, number> = {
  google_trends: 0.45,   // comparación directa entre destinos (3 plantillas, con ancla)
  google_related: 0.2,   // volumen relativo en las relacionadas de "paquetes", "viajes", "vuelos"…
  autocomplete: 0.2,     // qué completa Google Argentina (con expansión por letra)
  youtube: 0.1,          // qué completa YouTube: inspiración y vlogs
  trending_now: 0.05,    // el destino aparece en "tendencias ahora" de Argentina
}

/** Grupos de comparación por plantilla: 5 + 4 + 4 + 4 = 17 destinos validados. */
export const TRENDS_COMPARISON_GROUPS = 4
export const TOP_DISCOVERED_FOR_VALIDATION = 17
/** Destinos para los que se piden consultas relacionadas propias. */
export const TRENDS_RELATED_TOP = 4
/** Llamadas a SerpAPI por corrida: 3 × 4 comparaciones + 4 relacionadas + 7 genéricas + 1 tendencias ahora = 24. */
export const SERPAPI_CALLS_PER_RUN = TRENDS_TEMPLATES.length * TRENDS_COMPARISON_GROUPS + TRENDS_RELATED_TOP + GENERIC_TREND_SEEDS.length + 1

/** Umbrales de momentum (% de cambio contra la corrida anterior). */
export const MOMENTUM_THRESHOLDS = {
  surging: 50,
  rising: 15,
  falling: -15,
}

/** Score mínimo para que un destino cuente como relevante. */
export const MIN_TREND_SCORE = 10

/**
 * Para calcular momentum sólo sirve una corrida reciente: contra una de hace
 * meses cualquier destino parece "surging" o "falling".
 */
export const PREV_RUN_MAX_AGE_DAYS = 21

/**
 * Semana ISO 8601 (lunes a domingo) en formato 2026-W38. Es la clave de
 * trend_runs y demand_signals_weekly. Ordena bien como texto.
 */
export function isoWeekLabel(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
