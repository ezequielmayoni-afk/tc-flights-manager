import { grupoDestino, temporada, type GrupoDestino } from './titles'

/**
 * Títulos con la temporada desfasada (Fase 14).
 *
 * La URL es el producto: cuando se corre la salida de una ficha, el id no cambia
 * pero el título ("… – Temporada baja 2026"), el H1 y los meta tags tienen que
 * seguir a la fecha nueva. Esta regla compara la etiqueta de temporada que tiene
 * el título con la que corresponde a la salida cargada hoy en TC y propone el
 * título y los meta nuevos. Puro; el job `seo.title_drift` trae los datos, guarda
 * la propuesta, la aplica si el flag lo permite y avisa.
 */

export interface DriftCandidate {
  tcPackageId: number
  title: string
  metaTitle?: string | null
  metaDescription?: string | null
  /** Próxima salida cargada en TC (YYYY-MM-DD). */
  departureDate: string | null
  /** Fin del rango de salidas, si la ficha tiene varias. */
  dateRangeEnd?: string | null
  destinations: string[]
  nights: number
  impressions: number
  clicks: number
  url?: string | null
}

export interface TitleDrift extends DriftCandidate {
  grupo: GrupoDestino
  currentLabel: string
  expectedLabel: string
  expectedTitle: string
  /** null = el meta no menciona la temporada vieja: hay que revisarlo a mano. */
  expectedMetaTitle: string | null
  expectedMetaDescription: string | null
}

/**
 * Rango de salidas: hasta 120 días manda la próxima salida; entre 120 y 400 días la
 * ficha vende varias temporadas ("Salidas 2026 y 2027"); más que eso es una vigencia
 * genérica de TC y vuelve a mandar la próxima salida.
 */
const RANGO_VARIAS_TEMPORADAS_DIAS = 120
const RANGO_MAXIMO_DIAS = 400
const DIA = 86_400_000

const MESES_RE = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre'
/** Sólo lo que la regla de temporadas puede haber escrito; "– Desde Salta" o "- 20 septiembre" no cuentan. */
const ETIQUETA_RE = new RegExp(
  `^(?:Verano europeo|Verano|Temporada baja|Vacaciones de invierno|Semana Santa|Fin de año|Primavera|Otoño|${MESES_RE})\\s\\d{4}$|^Salidas\\s\\d{4}(?:\\sy\\s\\d{4})?$`,
  'i'
)

/** Etiqueta de temporada del título: lo que viene después del último " – ", si es una etiqueta conocida. */
export function etiquetaDe(title: string): string | null {
  const m = title.match(/\s[–-]\s([^–-]+)$/)
  if (!m) return null
  const label = m[1].trim()
  return ETIQUETA_RE.test(label) ? label : null
}

function salidasLabel(from: string, to: string): string {
  const y1 = Number(from.slice(0, 4))
  const y2 = Number(to.slice(0, 4))
  return y1 === y2 ? `Salidas ${y1}` : `Salidas ${y1} y ${y2}`
}

/** Etiqueta que corresponde a la salida cargada (o al rango, si es amplio). */
export function etiquetaEsperada(c: Pick<DriftCandidate, 'departureDate' | 'dateRangeEnd' | 'destinations' | 'nights'>): { grupo: GrupoDestino; label: string } | null {
  if (!c.departureDate || !/^\d{4}-\d{2}-\d{2}$/.test(c.departureDate)) return null
  const grupo = grupoDestino(c.destinations)
  if (grupo === 'evento') return null
  const noches = c.nights || 7
  const inicio = temporada(c.departureDate, { grupo, noches })
  const end = c.dateRangeEnd && /^\d{4}-\d{2}-\d{2}$/.test(c.dateRangeEnd) ? c.dateRangeEnd : null
  if (!end || end <= c.departureDate) return { grupo, label: inicio }
  const dias = (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${c.departureDate}T00:00:00Z`)) / DIA
  if (dias <= RANGO_VARIAS_TEMPORADAS_DIAS || dias > RANGO_MAXIMO_DIAS) return { grupo, label: inicio }
  if (temporada(end, { grupo, noches }) === inicio) return { grupo, label: inicio }
  return { grupo, label: salidasLabel(c.departureDate, end) }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Reemplaza la temporada vieja en un meta; null si el meta no la menciona. */
export function metaConTemporada(meta: string | null | undefined, vieja: string, nueva: string): string | null {
  if (!meta) return null
  const re = new RegExp(escapeRe(vieja), 'i')
  if (!re.test(meta)) return null
  return meta.replace(re, nueva)
}

export function findTitleDrift(candidates: DriftCandidate[]): TitleDrift[] {
  const out: TitleDrift[] = []
  for (const c of candidates) {
    const currentLabel = etiquetaDe(c.title)
    if (!currentLabel) continue
    const esperada = etiquetaEsperada(c)
    if (!esperada) continue
    if (esperada.label.toLowerCase() === currentLabel.toLowerCase()) continue
    const expectedTitle = c.title.slice(0, c.title.length - currentLabel.length) + esperada.label
    out.push({
      ...c,
      grupo: esperada.grupo,
      currentLabel,
      expectedLabel: esperada.label,
      expectedTitle,
      expectedMetaTitle: metaConTemporada(c.metaTitle, currentLabel, esperada.label),
      expectedMetaDescription: metaConTemporada(c.metaDescription, currentLabel, esperada.label),
    })
  }
  return out.sort((a, b) => b.impressions - a.impressions || a.tcPackageId - b.tcPackageId)
}

/** Aviso de Slack: sólo los desfasajes nuevos de hoy. */
export function buildDriftMessage(drifts: TitleDrift[], applied: Set<number>, hubUrl = 'https://hub.siviajo.com'): string {
  const lines = drifts.map(d => {
    const link = d.url ?? `https://www.siviajo.com/es/idea/${d.tcPackageId}/x`
    const estado = applied.has(d.tcPackageId) ? 'título y H1 ya cambiados; falta el meta en el back' : 'pendiente de aplicar'
    const meta = d.expectedMetaTitle === null && d.metaTitle ? ' · el meta título no menciona la temporada: revisar a mano' : ''
    return `• <${link}|${d.title}> → "${d.expectedLabel}" (salida ${d.departureDate}) · ${d.impressions} impresiones en 28 d · ${estado}${meta}`
  })
  return (
    `🗓️ SEO: ${drifts.length} ficha${drifts.length === 1 ? '' : 's'} con la temporada del título desfasada respecto de la salida cargada en TC.\n` +
    `${lines.join('\n')}\nVer y aplicar: ${hubUrl}/tareas`
  )
}
