import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

interface HealthCheck {
  status: 'ok' | 'error'
  latency?: number
  error?: string
}

interface HealthResponse {
  status: 'healthy' | 'unhealthy' | 'degraded'
  timestamp: string
  version: string
  uptime: number
  checks: Record<string, HealthCheck>
}

// Track server start time for uptime calculation
const startTime = Date.now()

/**
 * GET /api/health
 * Health check endpoint for monitoring and load balancers
 */
export async function GET() {
  const checks: Record<string, HealthCheck> = {}

  // 1. Check Supabase Database
  const dbStart = Date.now()
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Simple query to verify connection
    const { error } = await supabase
      .from('packages')
      .select('id')
      .limit(1)

    if (error) throw error

    checks.database = {
      status: 'ok',
      latency: Date.now() - dbStart
    }
  } catch (error) {
    checks.database = {
      status: 'error',
      latency: Date.now() - dbStart,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }

  // 2. Check required environment variables
  const requiredEnvVars = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]

  const optionalEnvVars = [
    'META_ACCESS_TOKEN',
    'META_AD_ACCOUNT_ID',
    'META_PAGE_ID',
    'OPENAI_API_KEY',
    'GOOGLE_DRIVE_CREDENTIALS',
    'GOOGLE_DRIVE_FOLDER_ID',
    'TC_API_BASE_URL',
    'TC_WEBHOOK_SECRET',
    'CRON_SECRET',
  ]

  const missingRequired = requiredEnvVars.filter(v => !process.env[v])
  const missingOptional = optionalEnvVars.filter(v => !process.env[v])

  if (missingRequired.length > 0) {
    checks.config = {
      status: 'error',
      error: `Missing required: ${missingRequired.join(', ')}`
    }
  } else if (missingOptional.length > 0) {
    checks.config = {
      status: 'ok',
      error: `Missing optional: ${missingOptional.join(', ')}`
    }
  } else {
    checks.config = { status: 'ok' }
  }

  // 3. Check memory usage (warn if > 80%)
  const memUsage = process.memoryUsage()
  const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024)
  const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024)
  const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100)

  checks.memory = {
    status: heapPercent > 96 ? 'error' : 'ok',
    error: heapPercent > 96 ? `High memory usage: ${heapPercent}%` : undefined,
  }

  // Determine overall status
  const allOk = Object.values(checks).every(c => c.status === 'ok')

  let overallStatus: 'healthy' | 'unhealthy' | 'degraded'
  if (checks.database.status === 'error' || checks.config.status === 'error') {
    overallStatus = 'unhealthy'
  } else if (!allOk) {
    overallStatus = 'degraded'
  } else {
    overallStatus = 'healthy'
  }

  const response: HealthResponse = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: Math.floor((Date.now() - startTime) / 1000),
    checks: {
      ...checks,
      // Add memory details
      memory: {
        ...checks.memory,
        latency: undefined,
        error: checks.memory.error || undefined,
      }
    }
  }

  // Add extended info in non-production
  const responseWithDebug = process.env.NODE_ENV !== 'production'
    ? {
        ...response,
        debug: {
          heapUsedMB,
          heapTotalMB,
          heapPercent,
          nodeVersion: process.version
        }
      }
    : response

  // Return 503 if unhealthy, 200 otherwise
  return NextResponse.json(responseWithDebug, {
    status: overallStatus === 'unhealthy' ? 503 : 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    }
  })
}
