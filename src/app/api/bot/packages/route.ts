import { NextRequest, NextResponse } from 'next/server'
import {
  authorizeBotApiRequest,
  parseCommercialVertical,
  parseNonNegativeInt,
  parsePositiveInt,
  searchCommercialPackages,
} from '@/lib/bot/commercial-packages'
import { errorResponse } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

/**
 * GET /api/bot/packages
 * Stable commercial package search for CRM bot tools.
 */
export async function GET(request: NextRequest) {
  const auth = authorizeBotApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const searchParams = request.nextUrl.searchParams

  try {
    const response = await searchCommercialPackages({
      search: searchParams.get('search') || undefined,
      destination: searchParams.get('destination') || undefined,
      vertical: parseCommercialVertical(searchParams.get('vertical')),
      month: searchParams.get('month') || undefined,
      dateFrom: searchParams.get('dateFrom') || undefined,
      dateTo: searchParams.get('dateTo') || undefined,
      limit: parsePositiveInt(searchParams.get('maxResults') || searchParams.get('limit'), 5, 10),
      offset: parseNonNegativeInt(searchParams.get('offset'), 0, 500),
    })

    return NextResponse.json(response)
  } catch (error) {
    console.error('[Bot Packages API] Error:', error)
    return errorResponse(error)
  }
}
