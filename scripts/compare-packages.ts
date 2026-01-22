/**
 * Compare two packages - one with availRange and one without
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const TC_API_BASE_URL = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const TC_MICROSITE_ID = process.env.TC_MICROSITE_ID || 'siviajo'
const TC_USERNAME = process.env.TC_USERNAME
const TC_PASSWORD = process.env.TC_PASSWORD

// Package WITH availRange
const PACKAGE_WITH_RANGE = 39728262
// Package WITHOUT availRange
const PACKAGE_WITHOUT_RANGE = 40175744

async function getToken(): Promise<string> {
  const response = await fetch(`${TC_API_BASE_URL}/authentication/authenticate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: TC_USERNAME,
      password: TC_PASSWORD,
      micrositeId: TC_MICROSITE_ID,
    }),
  })
  if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
  const data = await response.json()
  return data.token
}

async function getPackageDetail(token: string, packageId: number): Promise<unknown> {
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
    throw new Error(`Failed: ${response.status} - ${text}`)
  }
  return response.json()
}

async function main() {
  try {
    const token = await getToken()

    console.log('='.repeat(60))
    console.log('COMPARING PACKAGES')
    console.log('='.repeat(60))

    const pkgWith = await getPackageDetail(token, PACKAGE_WITH_RANGE) as Record<string, unknown>
    const pkgWithout = await getPackageDetail(token, PACKAGE_WITHOUT_RANGE) as Record<string, unknown>

    console.log('\n--- PACKAGE WITH AVAILRANGE (39728262) ---')
    console.log('Title:', pkgWith.title)
    console.log('User:', pkgWith.user)
    console.log('Creation Date:', pkgWith.creationDate)
    console.log('Departure Date:', pkgWith.departureDate)
    console.log('dateSettings:', JSON.stringify(pkgWith.dateSettings, null, 2))

    console.log('\n--- PACKAGE WITHOUT AVAILRANGE (40175744) ---')
    console.log('Title:', pkgWithout.title)
    console.log('User:', pkgWithout.user)
    console.log('Creation Date:', pkgWithout.creationDate)
    console.log('Departure Date:', pkgWithout.departureDate)
    console.log('dateSettings:', JSON.stringify(pkgWithout.dateSettings, null, 2))

    // Check all keys
    const keysWithRange = Object.keys(pkgWith).sort()
    const keysWithoutRange = Object.keys(pkgWithout).sort()

    console.log('\n--- KEYS COMPARISON ---')
    console.log('Keys in both:', keysWithRange.filter(k => keysWithoutRange.includes(k)).join(', '))
    console.log('Keys only in pkg WITH range:', keysWithRange.filter(k => !keysWithoutRange.includes(k)).join(', ') || 'none')
    console.log('Keys only in pkg WITHOUT range:', keysWithoutRange.filter(k => !keysWithRange.includes(k)).join(', ') || 'none')

  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  }
}

main()
