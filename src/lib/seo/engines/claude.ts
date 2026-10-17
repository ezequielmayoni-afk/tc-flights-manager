import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicClient } from '@/lib/anthropic/client'
import type { EngineAnswer } from '../geo'
import { GEO_SYSTEM_PROMPT } from './shared'

/**
 * Claude con la herramienta de búsqueda web del servidor (`web_search_20260209`),
 * ubicación aproximada Buenos Aires. Las citas salen de los bloques de texto
 * (`citations[]` de tipo `web_search_result_location`). Un `pause_turn` se
 * reanuda devolviendo el turno del asistente, como pide la API.
 */
const DEFAULT_MODEL = 'claude-opus-5-5'
const MAX_TURNS = 3

export function isClaudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

export async function askClaude(prompt: string): Promise<EngineAnswer> {
  const client = getAnthropicClient()
  const model = process.env.GEO_ANTHROPIC_MODEL || DEFAULT_MODEL
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: prompt }]

  let text = ''
  const citations: string[] = []
  let usedModel = model

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: GEO_SYSTEM_PROMPT,
      tools: [
        {
          type: 'web_search_20260209',
          name: 'web_search',
          max_uses: 5,
          user_location: { type: 'approximate', country: 'AR', city: 'Buenos Aires', timezone: 'America/Argentina/Buenos_Aires' },
        },
      ],
      messages,
    })
    usedModel = response.model

    for (const block of response.content) {
      if (block.type !== 'text') continue
      text += block.text
      for (const c of block.citations ?? []) {
        if (c.type === 'web_search_result_location' && c.url) citations.push(c.url)
      }
    }

    if (response.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: response.content })
      continue
    }
    if (response.stop_reason === 'refusal') throw new Error('Claude rechazó la pregunta (refusal)')
    break
  }

  return { text, citations, model: usedModel }
}
