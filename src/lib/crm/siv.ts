/**
 * Códigos SIV en los mensajes de WhatsApp. Dos formatos que significan cosas
 * distintas: "SIV 44495922" (6 a 8 dígitos, código de promo = tc_package_id,
 * prellenado por el anuncio) y "SIV-2622" (4 dígitos con guion, número de
 * file interno). Sólo nos interesa el primero. Puro.
 */
const PROMO = /\bSIV[\s_-]*([0-9]{6,9})\b/gi

export function extractSivCodes(text: string | null | undefined): number[] {
  if (!text) return []
  const out: number[] = []
  for (const m of text.matchAll(PROMO)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n >= 100000 && !out.includes(n)) out.push(n)
  }
  return out
}

/** El primer código del mensaje es el del anuncio; si hay varios, se devuelven todos. */
export function primarySivCode(text: string | null | undefined): number | null {
  return extractSivCodes(text)[0] ?? null
}
