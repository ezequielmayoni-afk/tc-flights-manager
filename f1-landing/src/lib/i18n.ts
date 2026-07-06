// Traducción al español de los nombres que vienen de P1 (nombres de GP y de
// sectores/entradas). Determinístico, sin costo. Se aplica en la capa de datos
// para que toda la web quede en español.

const GP_COUNTRY: Array<[RegExp, string]> = [
  [/\bbelgian\b/i, 'Bélgica'],
  [/\bhungarian\b/i, 'Hungría'],
  [/\bdutch\b/i, 'Países Bajos'],
  [/\bbritish\b/i, 'Gran Bretaña'],
  [/\baustrian\b/i, 'Austria'],
  [/\bspanish\b/i, 'España'],
  [/\bitalian\b/i, 'Italia'],
  [/\bmonaco\b/i, 'Mónaco'],
  [/\bcanadian\b/i, 'Canadá'],
  [/\bazerbaijan\b/i, 'Azerbaiyán'],
  [/\bsingapore\b/i, 'Singapur'],
  [/\bunited states\b/i, 'Estados Unidos'],
  [/\bmexican\b/i, 'México'],
  [/\bbrazilian\b/i, 'Brasil'],
  [/\bqatar\b/i, 'Catar'],
  [/\babu dhabi\b/i, 'Abu Dabi'],
  [/\bjapanese\b/i, 'Japón'],
  [/\baustralian\b/i, 'Australia'],
  [/\bsaudi arabian\b/i, 'Arabia Saudita'],
  [/\bbahrain\b/i, 'Baréin'],
  [/\bchinese\b/i, 'China'],
  [/\bfrench\b/i, 'Francia'],
  [/\bgerman\b/i, 'Alemania'],
  [/\bemilia romagna\b/i, 'Emilia-Romaña'],
]

// Sufijos de variante / palabras sueltas comunes en nombres.
const NAME_TOKENS: Array<[RegExp, string]> = [
  [/\bThu\/Fri\/Sat\/Sun\b/gi, 'Jue/Vie/Sáb/Dom'],
  [/\bThu\/Fri\/Sat\b/gi, 'Jue/Vie/Sáb'],
  [/\bFri\/Sat\/Sun\b/gi, 'Vie/Sáb/Dom'],
  [/\bSat\/Sun\b/gi, 'Sáb/Dom'],
  [/\bTicket \+ Hotel \+ Transfer\b/gi, 'Entrada + Hotel + Traslado'],
  [/\bTicket \+ Camping\b/gi, 'Entrada + Camping'],
  [/\bPitlane Walk\b/gi, 'Caminata Pitlane'],
  [/\bVIP Hospitality\b/gi, 'Hospitality VIP'],
  [/\bGrandstand\b/gi, 'Tribuna'],
  [/\bThursday\b/gi, 'Jueves'],
  [/\bFriday\b/gi, 'Viernes'],
  [/\bSaturday\b/gi, 'Sábado'],
  [/\bSunday\b/gi, 'Domingo'],
  [/\b3-?Day\b/gi, '3 días'],
  [/\b2-?Day\b/gi, '2 días'],
  [/\b1-?Day\b/gi, '1 día'],
]

/** "Belgian GP 2026 - Fri/Sat/Sun 2026" → "GP de Bélgica 2026 - Vie/Sáb/Dom 2026". */
export function translateEventName(name: string): string {
  if (!name) return name
  let out = name
  // "<Country> GP" o "Monza GP" → "GP de <País>" / "GP de Monza"
  for (const [re, es] of GP_COUNTRY) {
    if (re.test(out)) {
      out = out.replace(re, '').replace(/\bGP\b/, `GP de ${es}`).replace(/\s{2,}/g, ' ').trim()
      break
    }
  }
  // Casos que ya nombran el circuito (Monza, Las Vegas, Miami): "<X> GP" → "GP de <X>"
  out = out.replace(/^(Monza|Las Vegas|Miami|Imola|Zandvoort)\s+GP\b/i, 'GP de $1')
  for (const [re, es] of NAME_TOKENS) out = out.replace(re, es)
  return out
}

/** Traduce el nombre de un sector/entrada (mantiene el nombre propio del sector). */
export function translateSector(name: string): string {
  if (!name) return name
  let out = name
  for (const [re, es] of NAME_TOKENS) out = out.replace(re, es)
  return out
}
