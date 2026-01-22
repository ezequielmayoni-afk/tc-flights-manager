/**
 * Fetch and analyze TC Swagger documentation
 */

import { config } from 'dotenv'
import * as fs from 'fs'
config({ path: '.env.local' })

async function main() {
  try {
    console.log('Fetching Swagger JSON...')
    const response = await fetch('https://online.travelcompositor.com/resources/swagger.json')

    if (!response.ok) {
      throw new Error(`Failed: ${response.status}`)
    }

    const swagger = await response.json()

    // Save full swagger to file for analysis
    fs.writeFileSync('swagger-full.json', JSON.stringify(swagger, null, 2))
    console.log('Saved full swagger to swagger-full.json')

    // Search for relevant schemas
    const schemas = swagger.components?.schemas || swagger.definitions || {}

    console.log('\n=== SCHEMAS FOUND ===')
    const schemaNames = Object.keys(schemas)
    console.log(`Total schemas: ${schemaNames.length}`)

    // Find schemas related to ideas, packages, dates
    const relevantSchemas = schemaNames.filter(name =>
      name.toLowerCase().includes('idea') ||
      name.toLowerCase().includes('package') ||
      name.toLowerCase().includes('date') ||
      name.toLowerCase().includes('avail') ||
      name.toLowerCase().includes('range') ||
      name.toLowerCase().includes('setting')
    )

    console.log('\n=== RELEVANT SCHEMAS ===')
    relevantSchemas.forEach(name => {
      console.log(`\n--- ${name} ---`)
      console.log(JSON.stringify(schemas[name], null, 2))
    })

    // Search for PUT endpoints for packages
    const paths = swagger.paths || {}
    console.log('\n=== PACKAGE PUT ENDPOINTS ===')

    for (const [path, methods] of Object.entries(paths)) {
      if (path.includes('package') && (methods as Record<string, unknown>).put) {
        console.log(`\nPUT ${path}`)
        const putMethod = (methods as Record<string, unknown>).put as Record<string, unknown>
        console.log('Request body:', JSON.stringify(putMethod.requestBody, null, 2))
      }
    }

  } catch (error) {
    console.error('ERROR:', error)
    process.exit(1)
  }
}

main()
