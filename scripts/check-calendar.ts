/**
 * Script to check package calendar endpoint
 * Run with: npx tsx scripts/check-calendar.ts
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
  if (!response.ok) throw new Error(`Auth failed: ${response.status}`)
  const data = await response.json()
  return data.token
}

async function main() {
  try {
    const token = await getToken()

    // Try calendar endpoint
    console.log(`\n=== Checking calendar for package ${PACKAGE_ID} ===\n`)
    const calendarResponse = await fetch(
      `${TC_API_BASE_URL}/package/calendar/${TC_MICROSITE_ID}/${PACKAGE_ID}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'auth-token': token,
        },
      }
    )

    console.log('Calendar Response Status:', calendarResponse.status)
    const calendarText = await calendarResponse.text()

    if (calendarResponse.ok) {
      try {
        const calendarData = JSON.parse(calendarText)
        console.log('Calendar Data:', JSON.stringify(calendarData, null, 2).substring(0, 2000))
      } catch {
        console.log('Calendar Raw:', calendarText.substring(0, 2000))
      }
    } else {
      console.log('Calendar Error:', calendarText)
    }

    // Try travelidea endpoint for the same package
    console.log(`\n=== Checking travelidea endpoint for ${PACKAGE_ID} ===\n`)
    const ideaResponse = await fetch(
      `${TC_API_BASE_URL}/travelidea/${TC_MICROSITE_ID}/info/${PACKAGE_ID}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'auth-token': token,
        },
      }
    )

    console.log('TravelIdea Response Status:', ideaResponse.status)
    const ideaText = await ideaResponse.text()

    if (ideaResponse.ok) {
      try {
        const ideaData = JSON.parse(ideaText)
        console.log('TravelIdea dateSettings:', JSON.stringify(ideaData.dateSettings, null, 2))
      } catch {
        console.log('TravelIdea Raw:', ideaText.substring(0, 1000))
      }
    } else {
      console.log('TravelIdea Error:', ideaText)
    }

  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  }
}

main()
