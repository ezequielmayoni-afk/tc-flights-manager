import type { TCAuthRequest, TCAuthResponse } from './types'

const TC_API_BASE_URL = process.env.TC_API_BASE_URL || 'https://online.travelcompositor.com/resources'
const TC_USERNAME = process.env.TC_USERNAME || ''
const TC_PASSWORD = process.env.TC_PASSWORD || ''
const TC_MICROSITE_ID = process.env.TC_MICROSITE_ID || ''

// Token cache (in-memory for serverless, could use Redis for production)
let cachedToken: string | null = null
let tokenExpiration: number | null = null

/**
 * Get a valid auth token, fetching a new one if expired
 */
export async function getToken(): Promise<string> {
  const now = Date.now()

  // Check if we have a valid cached token (with 5 min buffer)
  if (cachedToken && tokenExpiration && now < tokenExpiration - 5 * 60 * 1000) {
    return cachedToken
  }

  // Fetch new token
  const authRequest: TCAuthRequest = {
    username: TC_USERNAME,
    password: TC_PASSWORD,
    micrositeId: TC_MICROSITE_ID,
  }

  const response = await fetch(`${TC_API_BASE_URL}/authentication/authenticate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(authRequest),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`TC Auth failed: ${response.status} - ${errorText}`)
  }

  const data: TCAuthResponse = await response.json()

  // Cache the token
  cachedToken = data.token
  tokenExpiration = now + (data.expirationInSeconds * 1000)

  return cachedToken
}

/**
 * Clear the cached token (useful for testing or forced refresh)
 */
export function clearTokenCache(): void {
  cachedToken = null
  tokenExpiration = null
}

/**
 * Check if credentials are configured
 */
export function hasCredentials(): boolean {
  return Boolean(TC_USERNAME && TC_PASSWORD && TC_MICROSITE_ID)
}
