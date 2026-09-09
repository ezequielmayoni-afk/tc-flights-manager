import type { DatePair } from './types'

/**
 * Calendario del barrido: qué pares ida/vuelta se sondean cada mes.
 *
 * Todo es puro y determinista (mismo input ⇒ misma salida) para que el job
 * nocturno sea reproducible y los tests no dependan de la hora ni de la zona
 * horaria de la máquina: se trabaja con strings `YYYY-MM-DD` y `Date.UTC`,
 * nunca con `new Date(string)` (ver la nota de `src/lib/dates.ts`).
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const ISO_MONTH = /^\d{4}-\d{2}$/

/** Tabla fija: `Intl` depende del locale de la máquina y del VPS. */
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'] as const
const MESES_CORTOS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'] as const

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function partesFecha(date: string): { year: number; month: number; day: number } {
  if (!ISO_DATE.test(date)) throw new Error(`Fecha inválida (se espera YYYY-MM-DD): ${date}`)
  const [year, month, day] = date.split('-').map(Number)
  return { year, month, day }
}

/** ¿Es una fecha ISO que además existe en el calendario (no un 2026-02-31)? */
export function isValidIsoDate(date: string | null | undefined): boolean {
  if (typeof date !== 'string' || !ISO_DATE.test(date)) return false
  const [year, month, day] = date.split('-').map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

function partesMes(month: string): { year: number; month: number } {
  if (!ISO_MONTH.test(month)) throw new Error(`Mes inválido (se espera YYYY-MM): ${month}`)
  const [year, mes] = month.split('-').map(Number)
  if (mes < 1 || mes > 12) throw new Error(`Mes inválido: ${month}`)
  return { year, month: mes }
}

function isoDeUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10)
}

/** El día calendario UTC de `now`. */
export function todayIso(now: Date): string {
  return isoDeUtc(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

export function monthOf(date: string): string {
  partesFecha(date)
  return date.slice(0, 7)
}

export function addDays(date: string, n: number): string {
  const { year, month, day } = partesFecha(date)
  return isoDeUtc(Date.UTC(year, month - 1, day + n))
}

/** ISO 8601: 1 = lunes … 7 = domingo. */
export function isoDow(date: string): number {
  const { year, month, day } = partesFecha(date)
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay()
  return dow === 0 ? 7 : dow
}

export function daysInMonth(month: string): number {
  const { year, month: mes } = partesMes(month)
  return new Date(Date.UTC(year, mes, 0)).getUTCDate()
}

/** `n` meses `YYYY-MM` empezando por el mes de `today` (UTC). */
export function monthsAhead(today: Date, n: number): string[] {
  const year = today.getUTCFullYear()
  const mes = today.getUTCMonth()
  const meses: string[] = []
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(year, mes + i, 1))
    meses.push(`${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`)
  }
  return meses
}

/** '2026-12' → 'Diciembre 2026'. */
export function monthLabel(month: string): string {
  const { year, month: mes } = partesMes(month)
  return `${MESES[mes - 1]} ${year}`
}

/** '2026-12' → 'DIC 2026'. */
export function monthShort(month: string): string {
  const { year, month: mes } = partesMes(month)
  return `${MESES_CORTOS[mes - 1]} ${year}`
}

/** FNV-1a de 32 bits: hash estable entre corridas y entre máquinas. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function claveDePar(par: DatePair): string {
  return `${par.depart}|${par.return}`
}

export interface GenerateDatePairsOptions {
  month: string
  today: Date
  /** ISO: 1 = lunes … 7 = domingo. Vacío = todas las fechas del mes. */
  weekdays: number[]
  stays: number[]
  perMonth: number
  minLeadDays: number
  /** Si viene, dos de los pares se rotan de forma determinista para explorar. */
  rotationSeed?: string
}

/**
 * Los pares ida/vuelta a sondear en un mes.
 *
 * La base son pares fijos (las fechas candidatas con las estadías en round
 * robin) para que la serie histórica sea comparable noche a noche; con
 * `rotationSeed` se cambian los dos últimos por "exploradores" del resto del
 * pool, así el barrido descubre combinaciones nuevas sin perder la serie.
 */
export function generateDatePairs(opts: GenerateDatePairsOptions): DatePair[] {
  const { month, today, weekdays, stays, perMonth, minLeadDays, rotationSeed } = opts
  if (perMonth <= 0 || stays.length === 0) return []

  const { year, month: mes } = partesMes(month)
  const desde = addDays(todayIso(today), minLeadDays)

  // 1. Candidatas: los días del mes que caen en los weekdays pedidos y ya
  //    respetan la anticipación mínima.
  const candidatas: string[] = []
  for (let dia = 1; dia <= daysInMonth(month); dia++) {
    const fecha = `${year}-${pad2(mes)}-${pad2(dia)}`
    if (fecha < desde) continue
    if (weekdays.length > 0 && !weekdays.includes(isoDow(fecha))) continue
    candidatas.push(fecha)
  }
  if (candidatas.length === 0) return []

  const par = (depart: string, nights: number): DatePair => ({ depart, return: addDays(depart, nights), nights })

  // Pool completo de combinaciones (candidata × estadía), en orden.
  const pool: DatePair[] = []
  for (const fecha of candidatas) for (const nights of stays) pool.push(par(fecha, nights))

  // 2. Pares fijos: round robin de estadías sobre las candidatas y, si falta,
  //    el resto del pool en orden.
  const elegidos: DatePair[] = []
  const vistos = new Set<string>()
  const sumar = (p: DatePair): void => {
    const clave = claveDePar(p)
    if (vistos.has(clave)) return
    vistos.add(clave)
    elegidos.push(p)
  }
  for (let i = 0; i < candidatas.length && elegidos.length < perMonth; i++) {
    sumar(par(candidatas[i], stays[i % stays.length]))
  }
  for (let i = 0; i < pool.length && elegidos.length < perMonth; i++) sumar(pool[i])

  // 3. Rotación: dos exploradores del resto del pool reemplazan a los dos
  //    últimos elegidos.
  if (rotationSeed && pool.length > elegidos.length) {
    const hash = fnv1a(`${rotationSeed}${month}`)
    const exploradores: DatePair[] = []
    for (let offset = 0; offset < pool.length && exploradores.length < 2; offset++) {
      const candidato = pool[(hash + offset) % pool.length]
      const clave = claveDePar(candidato)
      if (vistos.has(clave)) continue
      vistos.add(clave)
      exploradores.push(candidato)
    }
    if (exploradores.length > 0) {
      elegidos.splice(elegidos.length - exploradores.length, exploradores.length)
      elegidos.push(...exploradores)
    }
  }

  // 4. Salida estable: por salida y, a igual salida, por estadía.
  return elegidos
    .sort((a, b) => a.depart.localeCompare(b.depart) || a.nights - b.nights)
    .slice(0, perMonth)
}
