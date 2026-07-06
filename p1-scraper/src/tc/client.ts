import { config as dotenv } from 'dotenv'
import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { existsSync } from 'node:fs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
for (const p of [path.join(root,'.env.local'), path.join(root,'..','.env.local')]) { if (existsSync(p)) { dotenv({ path: p }); break } }

const BASE = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const USER = process.env.TC_USERNAME!
const PASS = process.env.TC_PASSWORD!
const MICRO = process.env.TC_MICROSITE_ID || 'siviajo'
export const TC_SUPPLIER = process.env.TC_SUPPLIER_ID || '18259'

let cached: { token: string; exp: number } | null = null
export async function tcToken(): Promise<string> {
  if (cached && Date.now() < cached.exp - 60_000) return cached.token
  const r = await fetch(`${BASE}/authentication/authenticate`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username: USER, password: PASS, micrositeId: MICRO }),
  })
  if (!r.ok) throw new Error(`TC auth ${r.status}: ${await r.text()}`)
  const d = await r.json() as { token: string; expirationInSeconds?: number }
  cached = { token: d.token, exp: Date.now() + (d.expirationInSeconds || 7200) * 1000 }
  return d.token
}

export async function tc<T = unknown>(endpoint: string, opts: RequestInit = {}, extraHeaders: Record<string,string> = {}): Promise<{ status: number; ok: boolean; body: T | string }> {
  const token = await tcToken()
  const r = await fetch(`${BASE}${endpoint}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'auth-token': token, ...extraHeaders, ...(opts.headers||{}) },
  })
  const text = await r.text()
  let body: T | string = text
  try { body = JSON.parse(text) as T } catch { /* keep text */ }
  return { status: r.status, ok: r.ok, body }
}
export { BASE as TC_BASE }
