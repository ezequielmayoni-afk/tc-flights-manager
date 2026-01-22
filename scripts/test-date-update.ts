/**
 * Script to test updating a package's date range in TravelCompositor
 * Run with: npx tsx scripts/test-date-update.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const TC_API_BASE_URL = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const TC_MICROSITE_ID = process.env.TC_MICROSITE_ID || 'siviajo'
const TC_USERNAME = process.env.TC_USERNAME
const TC_PASSWORD = process.env.TC_PASSWORD

// Test parameters - using package that already has availRange
const PACKAGE_ID = 39728262
const START_DATE = '2026-03-01'  // Changed from 2026-04-01
const END_DATE = '2026-07-31'    // Changed from 2026-06-30

async function getToken(): Promise<string> {
  console.log('[Auth] Getting token...')
  const response = await fetch(`${TC_API_BASE_URL}/authentication/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TC_USERNAME,
      password: TC_PASSWORD,
      micrositeId: TC_MICROSITE_ID,
    }),
  })

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`)
  }

  const data = await response.json()
  console.log('[Auth] Token obtained')
  return data.token
}

async function getPackageInfo(token: string, packageId: number): Promise<unknown> {
  console.log(`[TC] Getting package info for ${packageId}...`)
  const response = await fetch(`${TC_API_BASE_URL}/package/${TC_MICROSITE_ID}/info/${packageId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'auth-token': token,
    },
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Get package info failed: ${response.status} - ${text}`)
  }

  return response.json()
}

async function updatePackageDateRange(
  token: string,
  packageId: number,
  startDate: string,
  endDate: string
): Promise<unknown> {
  console.log(`[TC] Updating package ${packageId} date range: ${startDate} to ${endDate}...`)

  // Try multiple possible field structures
  const body = {
    // Option 1: nested dateSettings
    dateSettings: {
      availRange: {
        start: startDate,
        end: endDate,
      },
    },
    // Option 2: root level fields (from TCPackageDetailResponse)
    dateRangeStart: startDate,
    dateRangeEnd: endDate,
  }

  console.log('[TC] Request body:', JSON.stringify(body, null, 2))

  const response = await fetch(`${TC_API_BASE_URL}/package/${TC_MICROSITE_ID}/${packageId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'auth-token': token,
    },
    body: JSON.stringify(body),
  })

  const text = await response.text()
  console.log(`[TC] Response status: ${response.status}`)
  console.log(`[TC] Response body: ${text}`)

  if (!response.ok) {
    throw new Error(`Update failed: ${response.status} - ${text}`)
  }

  return text ? JSON.parse(text) : { success: true }
}

async function main() {
  try {
    console.log('='.repeat(60))
    console.log('Testing TravelCompositor Package Date Range Update')
    console.log('='.repeat(60))
    console.log(`Package ID: ${PACKAGE_ID}`)
    console.log(`New date range: ${START_DATE} to ${END_DATE}`)
    console.log('')

    // Get auth token
    const token = await getToken()

    // Get current package info
    console.log('\n--- BEFORE UPDATE ---')
    const beforeInfo = await getPackageInfo(token, PACKAGE_ID) as { dateSettings?: { availRange?: { start: string; end: string } } }
    console.log('Current dateSettings:', JSON.stringify(beforeInfo.dateSettings, null, 2))

    // Update date range
    console.log('\n--- UPDATING ---')
    const result = await updatePackageDateRange(token, PACKAGE_ID, START_DATE, END_DATE)
    console.log('Update result:', JSON.stringify(result, null, 2))

    // Get updated package info
    console.log('\n--- AFTER UPDATE ---')
    const afterInfo = await getPackageInfo(token, PACKAGE_ID) as { dateSettings?: { availRange?: { start: string; end: string } } }
    console.log('New dateSettings:', JSON.stringify(afterInfo.dateSettings, null, 2))

    // Compare
    console.log('\n--- COMPARISON ---')
    const beforeRange = beforeInfo.dateSettings?.availRange
    const afterRange = afterInfo.dateSettings?.availRange
    console.log(`Before: ${beforeRange?.start || 'N/A'} to ${beforeRange?.end || 'N/A'}`)
    console.log(`After:  ${afterRange?.start || 'N/A'} to ${afterRange?.end || 'N/A'}`)

    if (afterRange?.start === START_DATE && afterRange?.end === END_DATE) {
      console.log('\n✅ SUCCESS: Date range was updated correctly!')
    } else {
      console.log('\n❌ FAILED: Date range was not updated as expected')
    }

  } catch (error) {
    console.error('\n❌ ERROR:', error)
    process.exit(1)
  }
}

main()
