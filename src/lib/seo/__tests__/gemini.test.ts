import { describe, expect, it } from 'vitest'
import { citationFromChunk } from '../engines/gemini'

describe('citationFromChunk', () => {
  it('usa la URI cuando es legible y reconstruye el dominio cuando es un redirect de Vertex', () => {
    expect(citationFromChunk({ web: { uri: 'https://www.siviajo.com/es/', title: 'siviajo.com' } })).toBe('https://www.siviajo.com/es/')
    expect(citationFromChunk({ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'siviajo.com' } })).toBe('https://siviajo.com/')
    expect(citationFromChunk({ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'Un título largo' } })).toContain('vertexaisearch')
    expect(citationFromChunk({})).toBeNull()
  })
})
