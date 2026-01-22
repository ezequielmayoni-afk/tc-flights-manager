/**
 * Script to check a package's info in TravelCompositor
 * Run with: npx tsx scripts/check-package.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const TC_API_BASE_URL = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const TC_MICROSITE_ID = process.env.TC_MICROSITE_ID || 'siviajo'
const TC_USERNAME = process.env.TC_USERNAME
const TC_PASSWORD = process.env.TC_PASSWORD

const PACKAGE_ID = 39728262

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

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status}`)
  }

  const data = await response.json()
  return data.token
}

async function getPackageInfo(token: string, packageId: number): Promise<unknown> {
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

async function main() {
  try {
    console.log(`Checking package ${PACKAGE_ID} in TravelCompositor...\n`)

    const token = await getToken()
    const info = await getPackageInfo(token, PACKAGE_ID) as {
      id: number
      title: string
      departureDate?: string
      dateSettings?: {
        availRange?: { start: string; end: string }
        operationDays?: Record<string, boolean>
        releaseDays?: number
        stopSales?: string[]
      }
    }

    console.log('Package ID:', info.id)
    console.log('Title:', info.title)
    console.log('Departure Date:', info.departureDate)
    console.log('\ndateSettings:')
    console.log(JSON.stringify(info.dateSettings, null, 2))

  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  }
}

main()
