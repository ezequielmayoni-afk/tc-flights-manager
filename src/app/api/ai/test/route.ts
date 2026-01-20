import { NextResponse } from 'next/server'
import { validateConfig } from '@/lib/vertex-ai/client'

/**
 * GET /api/ai/test
 * Test Vertex AI configuration and connectivity
 */
export async function GET() {
  try {
    // 1. Check environment variables
    const configCheck = validateConfig()

    const envStatus = {
      GOOGLE_CLOUD_PROJECT_ID: process.env.GOOGLE_CLOUD_PROJECT_ID ? '✓ Set' : '✗ Missing',
      GOOGLE_CLOUD_LOCATION: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1 (default)',
      GOOGLE_DRIVE_CREDENTIALS: process.env.GOOGLE_DRIVE_CREDENTIALS ? '✓ Set' : '✗ Missing',
    }

    // 2. Try to parse credentials
    let credentialsValid = false
    let serviceAccountEmail = null

    if (process.env.GOOGLE_DRIVE_CREDENTIALS) {
      try {
        const creds = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS)
        credentialsValid = !!creds.client_email && !!creds.private_key
        serviceAccountEmail = creds.client_email
      } catch {
        credentialsValid = false
      }
    }

    // 3. Try to get access token (validates auth)
    let authValid = false
    let authError = null

    if (credentialsValid) {
      try {
        const { google } = await import('googleapis')
        const credentials = JSON.parse(process.env.GOOGLE_DRIVE_CREDENTIALS!)

        const auth = new google.auth.JWT({
          email: credentials.client_email,
          key: credentials.private_key,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        })

        const { token } = await auth.getAccessToken()
        authValid = !!token
      } catch (err) {
        authError = err instanceof Error ? err.message : 'Unknown auth error'
      }
    }

    return NextResponse.json({
      status: configCheck.valid && credentialsValid && authValid ? 'OK' : 'ERROR',
      config: {
        ...envStatus,
        configValid: configCheck.valid,
        configErrors: configCheck.errors,
      },
      credentials: {
        valid: credentialsValid,
        serviceAccount: serviceAccountEmail,
      },
      auth: {
        valid: authValid,
        error: authError,
      },
      vertexAI: {
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        location: process.env.GOOGLE_CLOUD_LOCATION || 'us-central1',
        geminiModel: 'gemini-1.5-pro',
        imagenModel: 'imagen-3.0-generate-001',
      },
      nextSteps: !authValid ? [
        'Verify service account has Vertex AI User role',
        'Check if Vertex AI API is enabled in GCP console',
        'Verify the private key is correctly formatted in env',
      ] : ['Ready to generate creatives!'],
    })
  } catch (error) {
    return NextResponse.json(
      {
        status: 'ERROR',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
