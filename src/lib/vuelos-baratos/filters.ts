import { isValidIsoDate } from './date-pairs'
import type { ExplorerFilters, SortKey } from './types'

/**
 * Filtros del explorador de fechas, en la query string.
 *
 * La query es la fuente de verdad (las páginas son server components y los
 * filtros tienen que ser compartibles e indexables), así que parsear y
 * serializar tienen que ser inversas: `parse(serialize(f))` devuelve `f`.
 * Un valor inválido se ignora en silencio, nunca rompe la página.
 */

const ISO_MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const RANGO_ENTERO = /^(\d+)?-(\d+)?$/
const RANGO_NUMERO = /^(\d+(?:\.\d+)?)?-(\d+(?:\.\d+)?)?$/
const RANGO_FECHA = /^(\d{4}-\d{2}-\d{2})?\.\.(\d{4}-\d{2}-\d{2})?$/

const SORT_KEYS: SortKey[] = ['price', 'depart', 'return', 'nights', 'duration', 'stops', 'airline']

/** Claves que se pueden sacar de un filtro (las de orden y página son fijas). */
export type FilterKey = Exclude<keyof ExplorerFilters, 'sort' | 'dir' | 'page'>

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value
  const texto = typeof v === 'string' ? v.trim() : ''
  return texto === '' ? undefined : texto
}

function rangoEntero(raw: string | undefined): { min?: number; max?: number } {
  if (!raw) return {}
  const m = RANGO_ENTERO.exec(raw)
  if (!m || (m[1] === undefined && m[2] === undefined)) return {}
  return { min: m[1] === undefined ? undefined : Number(m[1]), max: m[2] === undefined ? undefined : Number(m[2]) }
}

function rangoNumero(raw: string | undefined): { min?: number; max?: number } {
  if (!raw) return {}
  const m = RANGO_NUMERO.exec(raw)
  if (!m || (m[1] === undefined && m[2] === undefined)) return {}
  return { min: m[1] === undefined ? undefined : Number(m[1]), max: m[2] === undefined ? undefined : Number(m[2]) }
}

function rangoFecha(raw: string | undefined): { from?: string; to?: string } {
  if (!raw) return {}
  const m = RANGO_FECHA.exec(raw)
  if (!m || (m[1] === undefined && m[2] === undefined)) return {}
  // El formato no alcanza: un 2026-13-45 matchea la regex pero no existe.
  if ((m[1] !== undefined && !isValidIsoDate(m[1])) || (m[2] !== undefined && !isValidIsoDate(m[2]))) return {}
  return { from: m[1], to: m[2] }
}

/**
 * Las comas separan los elementos de una lista, así que las que forman parte
 * de un valor ('Air Europa, S.A.') van escapadas a mano: el `%2C` del URL
 * encoding se pierde cuando Next decodifica la query.
 */
function escapaItem(value: string): string {
  return value.replace(/%/g, '%25').replace(/,/g, '%2C')
}

function desescapaItem(value: string): string {
  return value.replace(/%2C/g, ',').replace(/%25/g, '%')
}

function parseLista(raw: string | undefined): string[] | undefined {
  if (!raw) return undefined
  const items = raw
    .split(',')
    .map((v) => desescapaItem(v.trim()))
    .filter(Boolean)
  return items.length > 0 ? items : undefined
}

function dias(raw: string | undefined): number[] | undefined {
  if (!raw) return undefined
  const lista = raw
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
  const unicos = [...new Set(lista)]
  return unicos.length > 0 ? unicos : undefined
}

export function parseExplorerFilters(sp: Record<string, string | string[] | undefined>): ExplorerFilters {
  const month = first(sp.m)
  const stopsRaw = first(sp.stops)
  const estadia = rangoEntero(first(sp.stay))
  const salida = rangoFecha(first(sp.dep))
  const vuelta = rangoFecha(first(sp.ret))
  const precio = rangoNumero(first(sp.price))
  const aerolineas = parseLista(first(sp.air))
  const sortRaw = first(sp.sort)
  const dirRaw = first(sp.dir)
  const page = Number(first(sp.page))

  return {
    month: month && ISO_MONTH.test(month) ? month : undefined,
    stops: stopsRaw === '0' ? 0 : stopsRaw === '1' ? 1 : stopsRaw === '2' ? 2 : undefined,
    direct: first(sp.direct) === '1' ? true : undefined,
    stayMin: estadia.min,
    stayMax: estadia.max,
    departFrom: salida.from,
    departTo: salida.to,
    returnFrom: vuelta.from,
    returnTo: vuelta.to,
    departDow: dias(first(sp.dow)),
    returnDow: dias(first(sp.rdow)),
    priceMin: precio.min,
    priceMax: precio.max,
    airlines: aerolineas,
    sort: sortRaw && (SORT_KEYS as string[]).includes(sortRaw) ? (sortRaw as SortKey) : 'price',
    dir: dirRaw === 'desc' ? 'desc' : 'asc',
    page: Number.isInteger(page) && page >= 1 ? page : 1,
  }
}

function enc(value: string): string {
  return encodeURIComponent(value)
}

/**
 * Lista separada por comas. La coma separadora queda literal (es legal en una
 * query y hace la URL legible); la que va dentro de un valor viaja como `%2C`
 * escapado a mano, que sobrevive al decode de la query.
 */
function encLista(values: Array<string | number>): string {
  return encodeURIComponent(values.map((v) => escapaItem(String(v))).join(',')).replace(/%2C/g, ',')
}

/** Query string sin `?`, con las claves siempre en el mismo orden. */
export function serializeExplorerFilters(f: ExplorerFilters): string {
  const partes: string[] = []
  const add = (key: string, value: string): void => {
    partes.push(`${key}=${enc(value)}`)
  }

  if (f.month) add('m', f.month)
  if (f.stops !== undefined) add('stops', String(f.stops))
  if (f.direct) add('direct', '1')
  if (f.stayMin !== undefined || f.stayMax !== undefined) add('stay', `${f.stayMin ?? ''}-${f.stayMax ?? ''}`)
  if (f.departFrom || f.departTo) add('dep', `${f.departFrom ?? ''}..${f.departTo ?? ''}`)
  if (f.returnFrom || f.returnTo) add('ret', `${f.returnFrom ?? ''}..${f.returnTo ?? ''}`)
  if (f.departDow?.length) partes.push(`dow=${encLista(f.departDow)}`)
  if (f.returnDow?.length) partes.push(`rdow=${encLista(f.returnDow)}`)
  if (f.priceMin !== undefined || f.priceMax !== undefined) add('price', `${f.priceMin ?? ''}-${f.priceMax ?? ''}`)
  if (f.airlines?.length) partes.push(`air=${encLista(f.airlines)}`)
  if (f.sort !== 'price') add('sort', f.sort)
  if (f.dir !== 'asc') add('dir', f.dir)
  if (f.page > 1) add('page', String(f.page))

  return partes.join('&')
}

/** Copia sin esas claves. Al tocar un filtro la paginación vuelve a 1. */
export function filtersWithout(f: ExplorerFilters, ...keys: FilterKey[]): ExplorerFilters {
  const copia: ExplorerFilters = { ...f }
  for (const key of keys) delete copia[key]
  if (keys.length > 0) copia.page = 1
  return copia
}

/** Copia con el parche aplicado. Cambiar algo que no sea la página la resetea. */
export function filtersWith(f: ExplorerFilters, patch: Partial<ExplorerFilters>): ExplorerFilters {
  const cambiaFiltros = Object.keys(patch).some((k) => k !== 'page')
  return { ...f, ...patch, page: cambiaFiltros ? 1 : (patch.page ?? f.page) }
}

/** ¿Hay algo filtrado además del orden, la página y el mes? */
export function hasActiveFilters(f: ExplorerFilters): boolean {
  return Boolean(
    f.stops !== undefined ||
      f.direct ||
      f.stayMin !== undefined ||
      f.stayMax !== undefined ||
      f.departFrom ||
      f.departTo ||
      f.returnFrom ||
      f.returnTo ||
      f.departDow?.length ||
      f.returnDow?.length ||
      f.priceMin !== undefined ||
      f.priceMax !== undefined ||
      f.airlines?.length
  )
}
