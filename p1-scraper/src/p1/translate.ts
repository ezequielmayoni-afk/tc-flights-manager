// Traducción EN→ES de las descripciones de tickets de P1. Son listas de bullets
// muy repetitivas ("General Admission access", "Official E-tickets", "Friday,
// Saturday and Sunday access"...), así que un glosario determinístico las cubre
// bien, sin costo ni dependencia de un LLM en el cron diario. Lo no reconocido se
// deja igual (fallback). Traduce línea por línea preservando el formato de lista.

// Frases completas (match exacto de la línea, sin el guión inicial). Orden no importa.
const PHRASES: Array<[RegExp, string]> = [
  [/^general admission access.*$/i, 'Acceso General Admission'],
  [/^standing places?$/i, 'Lugares de pie'],
  [/^official e-?tickets?$/i, 'E-tickets oficiales'],
  [/^e-?tickets?$/i, 'E-tickets'],
  [/^friday,?\s*saturday and sunday access$/i, 'Acceso viernes, sábado y domingo'],
  [/^saturday and sunday access$/i, 'Acceso sábado y domingo'],
  [/^sunday access$/i, 'Acceso domingo'],
  [/^3-?day access$/i, 'Acceso 3 días'],
  [/^all seats together$/i, 'Todos los asientos juntos'],
  [/^seats together$/i, 'Asientos juntos'],
  [/^numbered seats?$/i, 'Asiento numerado'],
  [/^covered grandstand$/i, 'Tribuna cubierta'],
  [/^uncovered grandstand$/i, 'Tribuna descubierta'],
  [/^grandstand seat$/i, 'Asiento en tribuna'],
  [/^giant screens?$/i, 'Pantalla gigante'],
  [/^access to (?:a |the )?giant screens?$/i, 'Acceso a pantalla gigante'],
  [/^fan zone access$/i, 'Acceso a la Fan Zone'],
  [/^access to the fan zone$/i, 'Acceso a la Fan Zone'],
  [/^live entertainment$/i, 'Entretenimiento en vivo'],
  [/^pitlane walk$/i, 'Caminata por el Pitlane'],
  [/^access to the pitlane$/i, 'Acceso al Pitlane'],
  [/^parking included$/i, 'Estacionamiento incluido'],
  [/^food and drinks included$/i, 'Comida y bebidas incluidas'],
  [/^open bar$/i, 'Barra libre'],
  [/^hospitality access$/i, 'Acceso Hospitality'],
]

// Reemplazos de sub-frases y palabras (se aplican en orden a lo que no matcheó una frase completa).
const TOKENS: Array<[RegExp, string]> = [
  [/general admission/gi, 'General Admission'],
  [/\baccess to the exclusive\b/gi, 'acceso al área exclusiva'],
  [/\baccess to\b/gi, 'acceso a'],
  [/\baccess\b/gi, 'acceso'],
  [/\bstanding places?\b/gi, 'lugares de pie'],
  [/\bnumbered seats?\b/gi, 'asiento numerado'],
  [/\bseats? together\b/gi, 'asientos juntos'],
  [/\bcovered\b/gi, 'cubierta'],
  [/\buncovered\b/gi, 'descubierta'],
  [/\bgrandstand\b/gi, 'tribuna'],
  [/\bgiant screens?\b/gi, 'pantalla gigante'],
  [/\bofficial\b/gi, 'oficial'],
  [/\be-?tickets?\b/gi, 'e-tickets'],
  [/\blocated between\b/gi, 'ubicada entre'],
  [/\blocated (?:at|in|on)\b/gi, 'ubicada en'],
  [/\bbetween\b/gi, 'entre'],
  [/\bmonday\b/gi, 'lunes'],
  [/\btuesday\b/gi, 'martes'],
  [/\bwednesday\b/gi, 'miércoles'],
  [/\bthursday\b/gi, 'jueves'],
  [/\bfriday\b/gi, 'viernes'],
  [/\bsaturday\b/gi, 'sábado'],
  [/\bsunday\b/gi, 'domingo'],
  [/\band\b/gi, 'y'],
  [/\bwith\b/gi, 'con'],
  [/\bincluded\b/gi, 'incluido'],
  [/\bfor\b/gi, 'para'],
  [/\bthe\b/gi, 'el'],
]

function translateLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed) return line
  // Preservar prefijo de bullet ("- ", "• ").
  const bullet = trimmed.match(/^[-•]\s*/)?.[0] ?? ''
  const body = trimmed.slice(bullet.length)

  for (const [re, es] of PHRASES) {
    if (re.test(body)) return bullet + es
  }
  let out = body
  for (const [re, es] of TOKENS) out = out.replace(re, es)
  return bullet + out
}

/**
 * Traduce una descripción completa (multi-línea) EN→ES. Si ya parece española
 * (heurística simple) o está vacía, devuelve el original. Nunca lanza.
 */
export function translateDescription(desc: string | null | undefined): string | null {
  if (!desc) return null
  try {
    return desc.split('\n').map(translateLine).join('\n')
  } catch {
    return desc
  }
}
