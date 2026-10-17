import { google } from 'googleapis'
import type { EngineAnswer } from '../geo'
import { ENGINE_TIMEOUT_MS, GEO_SYSTEM_PROMPT } from './shared'

/**
 * Gemini con grounding en Google Search, vía Vertex AI (misma service account
 * que Drive/Search Console, scope cloud-platform). Las fuentes vienen en
 * `groundingMetadata.groundingChunks[].web`: la `uri` es un redirect de
 * Vertex y el `title` es el dominio, así que la cita se reconstruye como
 * `https://{dominio}/` cuando la URI no es legible.
 */
const DEFAULT_MODEL = 'gemini-2.5-flash'

export function isGeminiConfigured(): boolean {
  return !!process.env.GOOGLE_DRIVE_CREDENTIALS && !!process.env.GOOGLE_CLOUD_PROJECT_ID
}

async function accessToken(): Promise<string> {
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS
  if (!raw) throw new Error('GOOGLE_DRIVE_CREDENTIALS no está configurada')
  const credentials = JSON.parse(raw) as { client_email?: string; private_key?: string }
  const jwt = new google.auth.JWT({ email: credentials.client_email, key: credentials.private_key, scopes: ['https://www.googleapis.com/auth/cloud-platform'] })
  const { token } = await jwt.getAccessToken()
  if (!token) throw new Error('No se pudo obtener el token de Vertex AI')
  return token
}

interface GroundingChunk {
  web?: { uri?: string; title?: string; domain?: string }
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> }
    groundingMetadata?: { groundingChunks?: GroundingChunk[] }
  }>
  error?: { message?: string }
}

export function citationFromChunk(chunk: GroundingChunk): string | null {
  const web = chunk.web
  if (!web) return null
  const uri = web.uri ?? ''
  const esRedirect = /vertexaisearch\.cloud\.google\.com/i.test(uri)
  if (uri && !esRedirect) return uri
  const dominio = (web.domain || web.title || '').trim().toLowerCase()
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(dominio)) return `https://${dominio}/`
  return uri || null
}

export async function askGemini(prompt: string): Promise<EngineAnswer> {
  const project = process.env.GOOGLE_CLOUD_PROJECT_ID
  if (!project) throw new Error('GOOGLE_CLOUD_PROJECT_ID no está configurado')
  const location = process.env.GEO_GEMINI_LOCATION || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1'
  const model = process.env.GEO_GEMINI_MODEL || DEFAULT_MODEL
  const host = location === 'global' ? 'aiplatform.googleapis.com' : `${location}-aiplatform.googleapis.com`
  const endpoint = `https://${host}/v1/projects/${project}/locations/${location}/publishers/google/models/${model}:generateContent`

  const token = await accessToken()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: GEO_SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ googleSearch: {} }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 2048 },
    }),
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  })
  const data = (await res.json().catch(() => ({}))) as GenerateContentResponse
  if (!res.ok) throw new Error(`Vertex AI ${res.status}: ${data.error?.message ?? 'sin detalle'}`)

  const candidate = data.candidates?.[0]
  const text = (candidate?.content?.parts ?? []).map(p => p.text ?? '').join('')
  const citations = (candidate?.groundingMetadata?.groundingChunks ?? []).map(citationFromChunk).filter((u): u is string => !!u)
  return { text, citations, model }
}
