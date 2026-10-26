/** GET /api/giftcard/widget: el JS del widget (lo carga el tag de GTM "SV Giftcard widget" en la landing de TC). */
import { NextResponse } from 'next/server'
import { WIDGET_JS, WIDGET_VERSION } from '@/lib/giftcard/widget'
export const dynamic = 'force-static'
export async function GET() {
  return new NextResponse(WIDGET_JS, { status: 200, headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=300', 'X-Widget-Version': WIDGET_VERSION, 'Access-Control-Allow-Origin': '*' } })
}
