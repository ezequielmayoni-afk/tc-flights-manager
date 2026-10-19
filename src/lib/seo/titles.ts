/**
 * Reglas de título de las fichas de paquete (Fase 14).
 *
 * La URL de la ficha es el producto, no la salida: cuando un cupo se agota y
 * se corre la fecha, el título no tiene que cambiar. Por eso la fecha exacta
 * sale del título y entra la temporada con la que la gente busca.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Temporada con la que se busca, a partir de la fecha de salida: "Verano 2027",
 * "Vacaciones de invierno 2027", "Temporada baja 2026". Reemplaza la fecha exacta
 * del título ("– Salida 18 de noviembre 2026") para que la ficha no cambie de
 * título cada vez que se corre la salida: la URL es el producto, no la salida.
 */
export function temporada(salida: string): string {
  const [y, m] = salida.split('-').map(Number)
  if (m === 12) return `Verano ${y + 1}`
  if (m === 1 || m === 2) return `Verano ${y}`
  if (m === 3) return `Marzo ${y}`
  if (m === 7) return `Vacaciones de invierno ${y}`
  return `Temporada baja ${y}`
}

/** "… – Salida 5 nov 2026" / "… – Nov 2026" / "… – Primavera 2026" → "… – {temporada}". */
export function tituloSinFecha(title: string, salida: string | undefined): string {
  if (!salida) return title
  const mes = MESES.join('|')
  const abrev = MESES.map(x => x.slice(0, 3)).join('|')
  const re = new RegExp(`\\s[–-]\\s(?:Salidas?\\s.+|(?:${mes}|${abrev})\\.?\\s\\d{4}|Primavera\\s\\d{4}|Otoño\\s\\d{4})$`, 'i')
  if (!re.test(title)) return title
  if (/semana santa/i.test(title)) return title
  return title.replace(re, ` – ${temporada(salida)}`)
}

