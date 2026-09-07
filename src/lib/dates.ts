/**
 * Fechas del sistema.
 *
 * JavaScript interpreta una fecha pura ("2026-09-09") como medianoche UTC.
 * Como Argentina es UTC-3, al mostrarla se convierte a las 21:00 del día
 * anterior y aparece el 8 en vez del 9. Los campos DATE de la base no tienen
 * hora ni zona: son un día calendario y hay que tratarlos como tal.
 *
 * Los campos con hora (TIMESTAMPTZ: created_at, last_sync_at, deadlines) sí
 * representan un instante y su conversión a hora local es correcta, así que se
 * parsean como siempre.
 */

/** "2026-09-09" sí; "2026-09-09T10:00:00Z" no. */
const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/

/**
 * Convierte a Date respetando lo que el valor representa: una fecha pura se
 * arma en hora local (al mediodía, para que ningún cambio de horario la corra
 * de día), y un instante se parsea normalmente.
 */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value

  const texto = value.trim()
  if (SOLO_FECHA.test(texto)) {
    const [año, mes, dia] = texto.split('-').map(Number)
    return new Date(año, mes - 1, dia, 12, 0, 0)
  }

  const fecha = new Date(texto)
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

/** dd/mm/aa, el formato corto que ya usaban las tablas. */
export function formatDateShort(value: string | Date | null | undefined): string {
  const fecha = parseDate(value)
  if (!fecha) return '-'
  const dia = String(fecha.getDate()).padStart(2, '0')
  const mes = String(fecha.getMonth() + 1).padStart(2, '0')
  const año = String(fecha.getFullYear()).slice(-2)
  return `${dia}/${mes}/${año}`
}

/** Formato con nombre de mes: "09 sep 2026". */
export function formatDateLong(
  value: string | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }
): string {
  const fecha = parseDate(value)
  if (!fecha) return '-'
  return fecha.toLocaleDateString('es-AR', options)
}

/** Compara solo el día calendario, ignorando la hora. */
export function isPastDate(value: string | Date | null | undefined, now: Date = new Date()): boolean {
  const fecha = parseDate(value)
  if (!fecha) return false
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  return dia < hoy
}

/** Días que faltan hasta la fecha (negativo si ya pasó). */
export function daysUntil(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  const fecha = parseDate(value)
  if (!fecha) return null
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const dia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate())
  return Math.round((dia.getTime() - hoy.getTime()) / (24 * 60 * 60 * 1000))
}
