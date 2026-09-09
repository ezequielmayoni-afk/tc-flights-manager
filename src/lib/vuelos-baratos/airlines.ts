import { AIRLINE_DATA } from './data/airlines'
import { normalize } from './text'

/**
 * Logo de la aerolínea de una observación.
 *
 * El cotizador casi nunca manda `airline_code` (el bot no lee el prefijo del
 * número de vuelo), así que en la práctica se resuelve por NOMBRE: se
 * normalizan acentos y mayúsculas y se prueban algunos alias ('LATAM' es
 * 'Latam Airlines' en media Sudamérica). Si no se encuentra, `src: null` y la
 * tabla muestra sólo el nombre: mejor sin logo que con una URL inventada que
 * da 404.
 *
 * Se importa sólo desde el servidor (`data/airlines.ts` no va al bundle).
 */

/** Nombres que manda el proveedor y no coinciden literal con la tabla de TC. */
const ALIAS: Record<string, string> = {
  'latam': 'LA',
  'latam airlines': 'LA',
  'latam airlines group': 'LA',
  'latam chile': 'LU',
  'latam peru': 'LP',
  'latam brasil': 'JJ',
  'latam ecuador': 'XL',
  'latam colombia': '4C',
  'aerolineas argentinas s.a.': 'AR',
  'gol': 'G3',
  'gol linhas aereas': 'G3',
  'iberia': 'IB',
  'air europa s.a.': 'UX',
  'sky': 'H2',
  'jetsmart': 'JA',
  'aeromexico': 'AM',
  'copa': 'CM',
  'american': 'AA',
  'delta': 'DL',
  'united': 'UA',
  'lufthansa': 'LH',
  'klm': 'KL',
  'tap': 'TP',
  'tap portugal': 'TP',
}

/** Sufijos societarios que el proveedor a veces pega al nombre. */
const SUFIJOS = /[\s,]+(s\.?a\.?( de c\.?v\.?)?|s\.?a\.?s\.?|inc\.?|ltd\.?|llc\.?|group|airlines?|linhas aereas)$/

let porNombre: Map<string, string> | null = null

/** Índice nombre normalizado → código, armado una sola vez por proceso. */
function getPorNombre(): Map<string, string> {
  if (porNombre) return porNombre
  const mapa = new Map<string, string>()
  for (const [code, data] of Object.entries(AIRLINE_DATA)) {
    const key = normalize(data.name)
    // El primero gana: 'JetSmart' (JA) antes que 'Jetsmart Airlines' (WJ).
    if (key && !mapa.has(key)) mapa.set(key, code)
  }
  for (const [alias, code] of Object.entries(ALIAS)) {
    if (AIRLINE_DATA[code] && !mapa.has(alias)) mapa.set(alias, code)
  }
  porNombre = mapa
  return mapa
}

/** Va sacando ruido hasta que alguna variante matchea (o se acaban). */
function codigoPorNombre(name: string): string | null {
  const mapa = getPorNombre()
  const base = normalize(name)
  if (!base) return null

  const variantes = [base, base.replace(/[.,]/g, '').replace(/\s+/g, ' ').trim(), base.replace(SUFIJOS, '').trim()]
  for (const variante of variantes) {
    const code = variante ? mapa.get(variante) : undefined
    if (code) return code
  }
  return null
}

export interface AirlineLogo {
  /** URL del logo, o `null` si la aerolínea no está en la tabla de TC. */
  src: string | null
  /** El nombre a mostrar: el de la tabla si se resolvió, si no el del proveedor. */
  name: string
}

export function airlineLogo(code: string | null, name: string | null): AirlineLogo {
  const porCodigo = code ? AIRLINE_DATA[code.trim().toUpperCase()] : undefined
  if (porCodigo) return { src: porCodigo.logo, name: porCodigo.name.trim() || (name ?? '').trim() }

  const encontrado = name ? codigoPorNombre(name) : null
  const data = encontrado ? AIRLINE_DATA[encontrado] : undefined
  if (data) return { src: data.logo, name: data.name.trim() }

  return { src: null, name: (name ?? code ?? '').trim() }
}
