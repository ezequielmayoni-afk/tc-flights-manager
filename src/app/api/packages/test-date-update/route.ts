import { NextRequest, NextResponse } from 'next/server'
import { checkAdmin } from '@/lib/auth'
import { updatePackageDateRange, getPackageInfo } from '@/lib/travelcompositor/client'

// POST /api/packages/test-date-update
// Test endpoint to update a package's date range in TravelCompositor
export async function POST(request: NextRequest) {
  try {
    const { authorized } = await checkAdmin()
    if (!authorized) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const body = await request.json()
    const { packageId, startDate, endDate } = body

    if (!packageId || !startDate || !endDate) {
      return NextResponse.json(
        { error: 'packageId, startDate y endDate son requeridos' },
        { status: 400 }
      )
    }

    // First, get current package info to show before state
    console.log(`[Test] Fetching current package info for ${packageId}`)
    const beforeInfo = await getPackageInfo(packageId)
    const beforeDateSettings = beforeInfo?.dateSettings

    // Attempt to update
    console.log(`[Test] Attempting to update date range for package ${packageId}`)
    const result = await updatePackageDateRange(packageId, startDate, endDate)

    if (!result.success) {
      return NextResponse.json({
        success: false,
        error: result.error,
        before: beforeDateSettings,
      }, { status: 400 })
    }

    // Get updated package info to verify
    console.log(`[Test] Fetching updated package info for ${packageId}`)
    const afterInfo = await getPackageInfo(packageId)
    const afterDateSettings = afterInfo?.dateSettings

    return NextResponse.json({
      success: true,
      packageId,
      before: beforeDateSettings,
      after: afterDateSettings,
      response: result.response,
    })
  } catch (error) {
    console.error('[Test Date Update] Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Error interno' },
      { status: 500 }
    )
  }
}
