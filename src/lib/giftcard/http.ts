import { NextResponse } from 'next/server'
import { isAllowedOrigin } from './config'

export function cors(origin: string | null, methods = 'GET, POST, OPTIONS'): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? (origin as string) : 'https://www.siviajo.com',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  }
}
export function json(origin: string | null, body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { ...cors(origin), ...extra } })
}
export function options(origin: string | null): NextResponse {
  return new NextResponse(null, { status: 204, headers: cors(origin) })
}
