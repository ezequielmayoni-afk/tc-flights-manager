/**
 * Reglas de título de las fichas de paquete (Fase 14).
 *
 * La URL de la ficha es el producto, no la salida: cuando un cupo se agota y
 * se corre la fecha, el título no tiene que cambiar. Por eso la fecha exacta
 * sale del título y entra la temporada con la que la gente busca.
 *
 * La temporada depende del destino (acordado con Ezequiel el 2026-10-20):
 * - Caribe, Brasil y Argentina: alta = Verano (dic–feb), Semana Santa y Vacaciones
 *   de invierno (julio); marzo fuera de Semana Santa = "Marzo"; el resto = "Temporada baja".
 * - Europa y circuitos: "Verano europeo" (jun–sep), "Primavera" (abr–may), "Otoño" (oct),
 *   "Fin de año" (del 10 de diciembre en adelante), "Temporada baja" (nov–mar).
 * - Exóticos (Turquía, Egipto, Dubái, Asia, África, Perú…) y Orlando: nunca "temporada
 *   baja"; va el mes ("Noviembre 2026"); Orlando en julio = "Vacaciones de invierno".
 * - Eventos y grupales: la fecha es parte del producto y se conserva.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export type GrupoDestino = 'caribe' | 'brasil' | 'argentina' | 'europa' | 'exotico' | 'orlando' | 'evento'

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** Clasifica un paquete por sus destinos (nombres de TC) y, si se conoce, el país. */
export function grupoDestino(destinos: string[], pais?: string): GrupoDestino {
  const s = [...destinos, pais ?? ''].join(' ').toLowerCase()
  if (/orlando|disney|miami|florida/.test(s)) return 'orlando'
  if (/estambul|istanbul|turqu|egipto|egypt|cairo|dub[aá]i|emiratos|china|pek[ií]n|beijing|shangh|jap[oó]n|tailandia|bangkok|bali|vietnam|\bindia\b|sud[aá]frica|south africa|marruecos|grecia|atenas|santorini|cabo verde|jordania|per[uú]|cusco|lima|machu/.test(s)) return 'exotico'
  if (/espa[ñn]a|spain|madrid|barcelona|italia|italy|roma|rome|mil[aá]n|venecia|venice|florencia|par[ií]s|francia|france|portugal|lisboa|lisbon|londres|london|[aá]msterdam|alemania|suiza|z[uú]rich|praga|viena|budapest|europa|europe/.test(s)) return 'europa'
  if (/bariloche|calafate|ushuaia|iguaz[uú]|mendoza|salta|jujuy|c[oó]rdoba|mar del plata|argentina|patagonia/.test(s)) return 'argentina'
  if (/brasil|brazil|b[uú]zios|r[ií]o de janeiro|rio de janeiro|florian|porto seguro|arraial|macei|maragogi|galinhas|natal|pipa|praia do forte|sau[ií]pe|imbassa[ií]|salvador|fortaleza|jericoacoara/.test(s)) return 'brasil'
  return 'caribe'
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher), en UTC. */
export function pascua(year: number): Date {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

const DIA = 86_400_000

/** El viaje (salida + noches) pisa la Semana Santa: del Domingo de Ramos al Domingo de Pascua. */
export function esSemanaSanta(salida: string, noches = 7): boolean {
  const [y, m, d] = salida.split('-').map(Number)
  if (!y || !m || !d) return false
  const inicio = Date.UTC(y, m - 1, d)
  const fin = inicio + noches * DIA
  const easter = pascua(y).getTime()
  const ramos = easter - 7 * DIA
  return inicio <= easter && fin >= ramos
}

export interface TemporadaOpts {
  grupo?: GrupoDestino
  noches?: number
}

/**
 * Temporada con la que se busca, a partir de la fecha de salida y el grupo de destino:
 * "Verano 2027", "Semana Santa 2027", "Vacaciones de invierno 2027", "Temporada baja 2026",
 * "Verano europeo 2027", "Noviembre 2026". Reemplaza la fecha exacta del título para que
 * la ficha no cambie de título cada vez que se corre la salida.
 */
export function temporada(salida: string, opts: TemporadaOpts = {}): string {
  const grupo = opts.grupo ?? 'caribe'
  const noches = opts.noches ?? 7
  const [y, m, d] = salida.split('-').map(Number)
  if (grupo === 'evento') return `${d} de ${MESES[m - 1]} ${y}`
  if (esSemanaSanta(salida, noches)) return `Semana Santa ${y}`
  const mes = `${cap(MESES[m - 1])} ${y}`
  switch (grupo) {
    case 'europa':
      if (m >= 6 && m <= 9) return `Verano europeo ${y}`
      if (m === 4 || m === 5) return `Primavera ${y}`
      if (m === 10) return `Otoño ${y}`
      if (m === 12 && d >= 10) return `Fin de año ${y}`
      return `Temporada baja ${y}`
    case 'exotico':
      return mes
    case 'orlando':
      if (m === 7) return `Vacaciones de invierno ${y}`
      if (m === 12 && d >= 15) return `Fin de año ${y}`
      return mes
    default:
      if (m === 12) return `Verano ${y + 1}`
      if (m === 1 || m === 2) return `Verano ${y}`
      if (m === 3) return `Marzo ${y}`
      if (m === 7) return `Vacaciones de invierno ${y}`
      return `Temporada baja ${y}`
  }
}

/**
 * "… – Salida 5 nov 2026" / "… – Nov 2026" / "… – Temporada baja 2026" → "… – {temporada}".
 * Los títulos que ya dicen "Semana Santa" y los de grupales/eventos con fecha (", 20 de marzo 2027")
 * no se tocan.
 */
export function tituloSinFecha(title: string, salida: string | undefined, opts: TemporadaOpts = {}): string {
  if (!salida) return title
  const mes = MESES.join('|')
  const abrev = MESES.map(x => x.slice(0, 3)).join('|')
  const etiquetas = 'Temporada baja|Verano europeo|Verano|Vacaciones de invierno|Fin de año|Primavera|Otoño|Salidas'
  const re = new RegExp(`\\s[–-]\\s(?:Salidas?\\s.+|(?:${mes}|${abrev})\\.?\\s\\d{4}|(?:${etiquetas})\\s\\d{4}(?:\\sy\\s\\d{4})?)$`, 'i')
  if (!re.test(title)) return title
  if (/semana santa/i.test(title)) return title
  return title.replace(re, ` – ${temporada(salida, opts)}`)
}
