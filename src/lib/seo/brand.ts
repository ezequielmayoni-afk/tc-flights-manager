/**
 * ¿La consulta es de marca?
 *
 * En Search Console el 60–70 % de los clics de siviajo.com llegan por
 * "si viajo", "siviajo", "sí, viajo", "si viajo agencia"… y también por
 * variantes que Google ya asocia a la marca ("si viaje", "sri tour"). Separar
 * marca de no-marca es lo único que permite ver si el SEO crece de verdad:
 * la marca sube con la pauta y el boca a boca, no con el trabajo de SEO.
 */
const BRAND_PATTERNS: RegExp[] = [
  // "si viajo", "sí, viajo", "si,viajo", "si viajes", "si viaje"
  /\bs[ií]\s*,?\s*viaj(?:o|e|es|os)\b/i,
  /\bsiviajo\b/i,
  /\bsi\s*viaj\b/i,
  // Variante que Google agrupa con la marca (viene en los informes desde 2025)
  /\bsri\s*tour\b/i,
]

export function isBrandQuery(query: string): boolean {
  const q = query.normalize('NFC').trim()
  return BRAND_PATTERNS.some(re => re.test(q))
}

/** ¿El texto menciona a la agencia? (respuestas de los motores de IA) */
const MENTION_PATTERNS: RegExp[] = [/\bs[ií]\s*,?\s*viajo\b/i, /\bsiviajo\b/i]

export function mentionsBrand(text: string): boolean {
  return MENTION_PATTERNS.some(re => re.test(text))
}

/** ¿La URL pertenece a siviajo.com (cualquier subdominio)? */
export function isOwnUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase()
    return host === 'siviajo.com' || host.endsWith('.siviajo.com')
  } catch {
    return false
  }
}
