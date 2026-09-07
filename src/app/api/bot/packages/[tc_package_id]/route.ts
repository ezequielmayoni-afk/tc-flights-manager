import { NextRequest, NextResponse } from 'next/server'
import { authorizeBotApiRequest, getCommercialPackageByTcId } from '@/lib/bot/commercial-packages'
import { errorResponse } from '@/lib/api/errors'

export const dynamic = 'force-dynamic'

interface RouteParams {
  params: Promise<{ tc_package_id: string }>
}

/**
 * GET /api/bot/packages/[tc_package_id]
 * Stable commercial package details for CRM bot tools.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const auth = authorizeBotApiRequest(request)
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }

  const { tc_package_id: rawPackageId } = await params
  const tcPackageId = Number.parseInt(rawPackageId, 10)

  if (!/^\d+$/.test(rawPackageId) || !Number.isFinite(tcPackageId)) {
    return NextResponse.json({ error: 'Package ID invalido' }, { status: 400 })
  }

  try {
    const response = await getCommercialPackageByTcId(tcPackageId)
    return NextResponse.json(response)
  } catch (error) {
    console.error('[Bot Package Details API] Error:', error)
    return errorResponse(error)
  }
}
