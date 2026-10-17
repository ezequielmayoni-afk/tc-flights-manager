import { isOwnUrl, mentionsBrand } from './brand'
import { COMPETITORS } from './config'
import { competitorForUrl } from './serp'

/**
 * Lectura de la respuesta de un motor de IA (ChatGPT, Gemini, Claude) a una
 * pregunta de viajero: ¿nombra a Sí, Viajo?, ¿cita siviajo.com?, ¿a qué
 * competidores nombra o cita? Puro: los motores viven en `engines/`.
 */

export interface EngineAnswer {
  text: string
  /** URLs que el motor citó como fuente (de la búsqueda web). */
  citations: string[]
  model: string
}

export interface GeoReading {
  mentioned: boolean
  cited: boolean
  citedUrls: string[]
  /** Nombres de `COMPETITORS` mencionados en el texto o citados. */
  competitors: string[]
}

export function readAnswer(answer: Pick<EngineAnswer, 'text' | 'citations'>): GeoReading {
  const text = answer.text ?? ''
  const unique = [...new Set(answer.citations.filter(Boolean))]
  const citedUrls = unique.filter(isOwnUrl)

  const competitors = new Set<string>()
  for (const c of COMPETITORS) if (c.pattern.test(text)) competitors.add(c.name)
  for (const url of unique) {
    const c = competitorForUrl(url)
    if (c) competitors.add(c)
  }

  return {
    mentioned: mentionsBrand(text) || citedUrls.length > 0,
    cited: citedUrls.length > 0,
    citedUrls,
    competitors: [...competitors],
  }
}
