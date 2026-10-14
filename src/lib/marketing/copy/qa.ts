import { BRAND_VOICE } from '../brand'
import type { CopyPackageData, GeneratedCopy } from './types'

/**
 * Control de calidad de un copy antes de guardarlo. Puro: devuelve el copy
 * corregido cuando la corrección es mecánica (recortar un título) y lo
 * rechaza cuando inventa datos o viola políticas de Meta.
 */

export const LIMITS = { headline: 40, description: 30, primaryHook: 125, primaryMax: 600 } as const

const BAIT = /\b(etiquet[aá]|coment[aá]\b|compart[ií]\b|dale like|dejá tu like|seguinos para)/i
const POLICY = /\b(garantizad[oa]s?|gratis|100 ?% seguro|el mejor precio del mercado|sin excepci[oó]n)\b/i
const PERSONAL = /\b(est[aá]s (cansad[oa]|gord[oa]|deprimid[oa]|sol[oa]|endeudad[oa]))\b/i

export interface QaResult {
  status: 'ok' | 'fixed' | 'rejected'
  issues: string[]
  copy: GeneratedCopy
}

const cutAtWord = (s: string, max: number) => {
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const i = cut.lastIndexOf(' ')
  return (i > max * 0.6 ? cut.slice(0, i) : cut).replace(/[\s,;:.¡¿!?-]+$/, '')
}

const capsRatio = (s: string) => {
  const letters = s.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, '')
  if (letters.length < 12) return 0
  const upper = letters.replace(/[^A-ZÁÉÍÓÚÑ]/g, '').length
  return upper / letters.length
}

export function qaCopy(input: GeneratedCopy, pkg: Pick<CopyPackageData, 'pricePerPax' | 'nights' | 'cupoRemaining'> & { boardName?: string | null }): QaResult {
  const issues: string[] = []
  let fixed = false
  const copy: GeneratedCopy = { ...input, primary_text: (input.primary_text ?? '').trim(), headline: (input.headline ?? '').trim(), description: (input.description ?? '').trim() }

  if (!copy.primary_text || !copy.headline) return { status: 'rejected', issues: ['Falta el texto principal o el título'], copy }

  // Las reglas de contenido se evalúan sobre el texto completo, ANTES de recortar: un recorte puede esconder "todo incluido".
  const all = `${copy.primary_text} ${copy.headline} ${copy.description}`
  const lower = all.toLowerCase()
  for (const w of BRAND_VOICE.forbidden) {
    if (new RegExp(`\\b${w}\\b`, 'i').test(lower)) return { status: 'rejected', issues: [`Palabra fuera de la voz de marca: "${w}"`], copy }
  }
  if (BAIT.test(all)) return { status: 'rejected', issues: ['Engagement bait (etiquetá, comentá, compartí)'], copy }
  if (PERSONAL.test(all)) return { status: 'rejected', issues: ['Atributo personal del lector (política de Meta)'], copy }
  if (POLICY.test(all)) return { status: 'rejected', issues: ['Promesa que Meta puede rechazar (garantizado, gratis, el mejor precio del mercado)'], copy }
  if (capsRatio(copy.primary_text) > 0.5) return { status: 'rejected', issues: ['Texto principal casi todo en mayúsculas'], copy }

  // Datos inventados: cualquier precio en el texto tiene que ser el del paquete (±1 %).
  if (pkg.pricePerPax) {
    const prices = [...all.matchAll(/(?:USD|U\$S|US\$|\$)\s?([\d.]{3,9})/gi)].map(m => Number(m[1].replace(/\./g, '')))
    for (const p of prices) {
      if (Number.isFinite(p) && p > 50 && Math.abs(p - pkg.pricePerPax) / pkg.pricePerPax > 0.01) return { status: 'rejected', issues: [`Precio inventado: ${p} (el paquete sale ${Math.round(pkg.pricePerPax)})`], copy }
    }
  }
  // Régimen inventado: "todo incluido" sólo si el paquete lo es.
  const isAllInclusive = /todo incluido|all.?inclusive/i.test(pkg.boardName ?? '')
  if (!isAllInclusive && /\b(todo incluido|all.?inclusive)\b/i.test(all)) return { status: 'rejected', issues: [`Dice "todo incluido" y el régimen es ${pkg.boardName ?? 'desconocido'}`], copy }
  if (pkg.nights) {
    const nights = [...all.matchAll(/(\d{1,2})\s*noches?/gi)].map(m => Number(m[1]))
    if (nights.some(n => n !== pkg.nights)) return { status: 'rejected', issues: [`Noches inventadas (el paquete tiene ${pkg.nights})`], copy }
  }
  // Sin \b inicial: en JS \b no reconoce la Ú de "¡Últimos".
  if (pkg.cupoRemaining === null && /(últimos? (lugares?|cupos?)|quedan \d+|cupos? limitad)/i.test(all)) {
    issues.push('Habla de cupos y el paquete es de sistema'); return { status: 'rejected', issues, copy }
  }
  if (pkg.cupoRemaining !== null) {
    const seats = [...all.matchAll(/quedan\s+(\d{1,3})/gi)].map(m => Number(m[1]))
    if (seats.some(n => n !== pkg.cupoRemaining)) return { status: 'rejected', issues: [`Lugares inventados (quedan ${pkg.cupoRemaining})`], copy }
  }
  if (copy.headline.length > LIMITS.headline) { copy.headline = cutAtWord(copy.headline, LIMITS.headline); fixed = true; issues.push(`Título recortado a ${LIMITS.headline}`) }
  if (copy.description.length > LIMITS.description) { copy.description = cutAtWord(copy.description, LIMITS.description); fixed = true; issues.push(`Descripción recortada a ${LIMITS.description}`) }
  if (copy.primary_text.length > LIMITS.primaryMax) { copy.primary_text = cutAtWord(copy.primary_text, LIMITS.primaryMax); fixed = true; issues.push(`Texto principal recortado a ${LIMITS.primaryMax}`) }
  return { status: fixed ? 'fixed' : 'ok', issues, copy }
}
