/**
 * Test notification for new package imported
 * Run with: npx tsx scripts/test-notification.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function main() {
  console.log('Testing notification API...')
  console.log('APP_URL:', APP_URL)

  // First, let's check notification settings
  console.log('\n=== Checking notification settings ===')
  const settingsRes = await fetch(`${APP_URL}/api/notifications/settings`)
  if (settingsRes.ok) {
    const settings = await settingsRes.json()
    console.log('Slack enabled:', settings.slack_enabled)
    console.log('Webhook URL exists:', !!settings.slack_webhook_url)
    console.log('notify_new_package_imported:', settings.notify_new_package_imported)
  } else {
    console.log('Failed to get settings:', settingsRes.status, await settingsRes.text())
  }

  // Get a package to test with
  console.log('\n=== Getting a test package ===')
  const packagesRes = await fetch(`${APP_URL}/api/packages?limit=1`)
  if (!packagesRes.ok) {
    console.error('Failed to get packages:', await packagesRes.text())
    return
  }
  const packagesData = await packagesRes.json()
  const testPackage = packagesData.packages?.[0]

  if (!testPackage) {
    console.error('No packages found to test with')
    return
  }

  console.log('Test package:', testPackage.id, testPackage.tc_package_id, testPackage.title)

  // Send test notification
  console.log('\n=== Sending test notification ===')
  const notifyRes = await fetch(`${APP_URL}/api/notifications/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'new_package_imported',
      package_id: testPackage.id,
      data: {
        price: testPackage.current_price_per_pax || 1000,
        currency: testPackage.currency || 'USD',
        destinations_count: testPackage.destinations_count || 1,
        nights_count: testPackage.nights_count || 5,
        imported_by: 'Test Script',
      },
    }),
  })

  console.log('Response status:', notifyRes.status)
  const result = await notifyRes.json()
  console.log('Response:', JSON.stringify(result, null, 2))
}

main().catch(console.error)
