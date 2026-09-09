import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { authorizeCron } from '../auth'

function req(headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/cron/jobs-tick', { headers })
}

describe('authorizeCron', () => {
  const env = { ...process.env }
  beforeEach(() => {
    process.env.CRON_SECRET = 'secreto-cron'
    process.env.HUB_API_KEY = 'clave-api'
  })
  afterEach(() => {
    process.env = { ...env }
  })

  it('acepta el Bearer del cron', () => {
    const result = authorizeCron(req({ authorization: 'Bearer secreto-cron' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.via).toBe('cron_secret')
  })

  it('acepta la API key del CRM', () => {
    const result = authorizeCron(req({ 'x-api-key': 'clave-api' }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.via).toBe('api_key')
  })

  it('rechaza sin credenciales o con credenciales equivocadas', () => {
    expect(authorizeCron(req()).ok).toBe(false)
    expect(authorizeCron(req({ authorization: 'Bearer otra' })).ok).toBe(false)
    expect(authorizeCron(req({ 'x-api-key': 'otra' })).ok).toBe(false)
  })

  it('rechaza si el servidor no tiene ningún secreto configurado', () => {
    delete process.env.CRON_SECRET
    delete process.env.HUB_API_KEY
    const result = authorizeCron(req({ authorization: 'Bearer lo-que-sea' }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.response.status).toBe(500)
  })
})
