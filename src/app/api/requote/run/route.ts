import { NextResponse } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'
import { createClient } from '@supabase/supabase-js'
import { checkAndSendManualQuoteNotifications } from '@/lib/notifications/manual-quote'

function getSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

/**
 * POST /api/requote/run
 * Execute the requote bot and stream progress via SSE
 */
export async function POST() {
  const botPath = path.resolve(process.cwd(), '../tc-requote-bot')

  console.log('[Requote Run] Starting bot at:', botPath)

  // Create a TransformStream to stream data to the client
  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const sendEvent = async (type: string, data: unknown) => {
    const message = `data: ${JSON.stringify({ type, ...data as object })}\n\n`
    await writer.write(encoder.encode(message))
  }

  // Start the bot process
  const runBot = async () => {
    try {
      await sendEvent('status', { message: 'Iniciando bot...', stage: 'init' })

      const summary = {
        processed: 0,
        success: 0,
        errors: 0,
        needsManual: 0,
        autoUpdated: 0,
        noChange: 0,
        duration: '0s',
        packages: [] as { id: number; tcId: number; title: string; status: string; variance?: string }[],
      }

      let currentPackage: { id: number; tcId: number; title: string; status: string; variance?: string } | null = null

      // Force headless mode for server execution
      const env = { ...process.env, HEADLESS: 'true' }

      const child = spawn('npx', ['tsx', 'src/index.ts'], {
        cwd: botPath,
        env,
        shell: true,
      })

      child.stdout.on('data', async (data) => {
        const lines = data.toString().split('\n')
        for (const line of lines) {
          if (!line.trim()) continue

          // Parse different stages
          if (line.includes('Navigating to siviajo.com') || line.includes('Navigating to www.siviajo.com')) {
            await sendEvent('status', { message: 'Navegando a www.siviajo.com...', stage: 'login' })
          } else if (line.includes('Login successful')) {
            await sendEvent('status', { message: 'Login exitoso', stage: 'logged_in' })
          } else if (line.includes('Found') && line.includes('packages to check')) {
            const match = line.match(/Found (\d+) packages/)
            if (match) {
              await sendEvent('status', {
                message: `Encontrados ${match[1]} paquetes para verificar`,
                stage: 'found_packages',
                total: parseInt(match[1])
              })
            }
          } else if (line.includes('No packages to check')) {
            await sendEvent('status', { message: 'No hay paquetes pendientes', stage: 'no_packages' })
          } else if (line.includes('Checking package')) {
            const match = line.match(/package (\d+) \(TC: (\d+)\)/)
            if (match) {
              currentPackage = {
                id: parseInt(match[1]),
                tcId: parseInt(match[2]),
                title: '',
                status: 'checking',
              }
              await sendEvent('package_start', {
                id: currentPackage.id,
                tcId: currentPackage.tcId,
                message: `Verificando paquete ${match[2]}...`
              })
            }
          } else if (line.includes('[Bot] Title:') && currentPackage) {
            currentPackage.title = line.replace('[Bot] Title:', '').trim()
            await sendEvent('package_info', {
              id: currentPackage.id,
              title: currentPackage.title
            })
          } else if (line.includes('Navigating to package page')) {
            await sendEvent('package_status', { message: 'Abriendo página del paquete...' })
          } else if (line.includes('Found "reservar | ver fechas"')) {
            await sendEvent('package_status', { message: 'Haciendo clic en "Reservar"...' })
          } else if (line.includes('Found "buscar" button')) {
            await sendEvent('package_status', { message: 'Buscando disponibilidad...' })
          } else if (line.includes('Waiting for search results')) {
            await sendEvent('package_status', { message: 'Esperando resultados...' })
          } else if (line.includes('Extracting price')) {
            await sendEvent('package_status', { message: 'Extrayendo precio...' })
          } else if (line.includes('Variance:') && currentPackage) {
            const match = line.match(/Variance:\s+([\d.+-]+%)/)
            if (match) {
              currentPackage.variance = match[1]
              await sendEvent('package_variance', {
                id: currentPackage.id,
                variance: match[1]
              })
            }
          } else if (line.includes('NEEDS MANUAL REVIEW') && currentPackage) {
            currentPackage.status = 'needs_manual'
            summary.needsManual++
            summary.packages.push({ ...currentPackage })
            await sendEvent('package_done', {
              id: currentPackage.id,
              status: 'needs_manual',
              title: currentPackage.title,
              variance: currentPackage.variance,
              message: 'Requiere revisión manual'
            })
            // Notifications are sent in batch when bot finishes
          } else if (line.includes('clicking "Actualizar y guardar idea"') && currentPackage) {
            await sendEvent('package_status', { message: 'Actualizando precio...' })
          } else if (line.includes('Package updated successfully') && currentPackage) {
            currentPackage.status = 'updated'
            summary.autoUpdated++
            summary.packages.push({ ...currentPackage })
            await sendEvent('package_done', {
              id: currentPackage.id,
              status: 'updated',
              title: currentPackage.title,
              variance: currentPackage.variance,
              message: 'Actualizado correctamente'
            })
          } else if (line.includes('TC refresh:')) {
            await sendEvent('package_status', { message: 'Sincronizando con TC...' })
          } else if (line.includes('Waiting') && line.includes('before next package')) {
            await sendEvent('package_status', { message: 'Esperando antes del siguiente...' })
          } else if (line.includes('Processed:')) {
            const match = line.match(/Processed:\s+(\d+)/)
            if (match) summary.processed = parseInt(match[1])
          } else if (line.includes('Success:')) {
            const match = line.match(/Success:\s+(\d+)/)
            if (match) summary.success = parseInt(match[1])
          } else if (line.includes('Errors:') && !line.includes('errorDetails')) {
            const match = line.match(/Errors:\s+(\d+)/)
            if (match) summary.errors = parseInt(match[1])
          } else if (line.includes('Duration:')) {
            const match = line.match(/Duration:\s+([\d.]+s)/)
            if (match) summary.duration = match[1]
          } else if (line.includes('Browser closed')) {
            await sendEvent('status', { message: 'Cerrando navegador...', stage: 'closing' })
          }
        }
      })

      child.stderr.on('data', async (data) => {
        const line = data.toString().trim()
        if (line && !line.includes('dotenv')) {
          console.error('[Bot Error]', line)
        }
      })

      await new Promise<void>((resolve) => {
        child.on('close', async (code) => {
          console.log('[Requote Run] Bot finished with code:', code)

          // Send notifications for all packages with needs_manual status
          if (summary.needsManual > 0) {
            try {
              console.log('[Requote Run] Sending notifications for manual quote packages...')
              const notifResult = await checkAndSendManualQuoteNotifications()
              console.log(`[Requote Run] Notifications sent: ${notifResult.sent || 0}`)
            } catch (notifError) {
              console.error('[Requote Run] Error sending batch notifications:', notifError)
            }
          }

          await sendEvent('complete', {
            success: code === 0,
            summary
          })
          resolve()
        })

        child.on('error', async (err) => {
          console.error('[Requote Run] Failed to start bot:', err)
          await sendEvent('error', { message: `Error: ${err.message}` })
          resolve()
        })

        // Timeout after 10 minutes
        setTimeout(async () => {
          child.kill()
          await sendEvent('error', { message: 'Timeout: el bot tardó más de 10 minutos' })
          resolve()
        }, 10 * 60 * 1000)
      })
    } catch (error) {
      await sendEvent('error', {
        message: error instanceof Error ? error.message : 'Error desconocido'
      })
    } finally {
      await writer.close()
    }
  }

  // Start the bot in background
  runBot()

  // Return the stream as SSE
  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}

/**
 * GET /api/requote/run
 * Check how many packages are pending
 */
export async function GET() {
  const { createClient } = await import('@supabase/supabase-js')

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: pending, error } = await supabase
    .from('packages')
    .select('id, tc_package_id, title')
    .eq('requote_status', 'pending')
    .eq('monitor_enabled', true)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    pendingCount: pending?.length || 0,
    packages: pending || [],
  })
}
