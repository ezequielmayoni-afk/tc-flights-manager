import OpenAI from 'openai'
import type { EngineAnswer } from '../geo'
import { ENGINE_TIMEOUT_MS, GEO_SYSTEM_PROMPT } from './shared'

/**
 * ChatGPT con búsqueda web (Responses API + herramienta `web_search`),
 * ubicación aproximada Buenos Aires. Las citas salen de las anotaciones
 * `url_citation` del texto de salida.
 */
const DEFAULT_MODEL = 'gpt-5.1'

export function isOpenAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY
}

let client: OpenAI | null = null
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: ENGINE_TIMEOUT_MS })
  return client
}

export async function askChatGpt(prompt: string): Promise<EngineAnswer> {
  const model = process.env.GEO_OPENAI_MODEL || DEFAULT_MODEL
  const response = await getClient().responses.create({
    model,
    instructions: GEO_SYSTEM_PROMPT,
    input: prompt,
    tools: [
      {
        type: 'web_search',
        search_context_size: 'medium',
        user_location: { type: 'approximate', country: 'AR', city: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires' },
      },
    ],
  })

  const citations: string[] = []
  for (const item of response.output ?? []) {
    if (item.type !== 'message') continue
    for (const part of item.content ?? []) {
      if (part.type !== 'output_text') continue
      for (const a of part.annotations ?? []) {
        if (a.type === 'url_citation' && a.url) citations.push(a.url)
      }
    }
  }

  return { text: response.output_text ?? '', citations, model: response.model ?? model }
}
