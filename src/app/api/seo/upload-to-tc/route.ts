import { NextRequest } from 'next/server'
import { spawn } from 'child_process'
import path from 'path'

/**
 * POST /api/seo/upload-to-tc
 * Triggers the SEO upload bot for specific package IDs
 * Returns Server-Sent Events stream with real-time logs
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const { packageIds } = body as { packageIds: number[] }

  if (!packageIds || !Array.isArray(packageIds) || packageIds.length === 0) {
    return new Response(JSON.stringify({ error: 'No package IDs provided' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    start(controller) {
      const sendEvent = (type: string, data: string) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`))
      }

      sendEvent('info', `Iniciando bot para ${packageIds.length} paquetes...`)

      // Path to the bot project
      const botPath = path.resolve(process.cwd(), '..', 'tc-requote-bot')

      // Spawn the bot process
      const botProcess = spawn('npm', ['run', 'seo:manual', '--', ...packageIds.map(String)], {
        cwd: botPath,
        shell: true,
      })

      let output = ''

      botProcess.stdout.on('data', (data) => {
        const str = data.toString()
        output += str
        // Send each line as a separate event
        const lines = str.split('\n').filter((line: string) => line.trim())
        for (const line of lines) {
          if (line.includes('[SEO Bot]') || line.includes('[Manual]') || line.includes('========')) {
            sendEvent('log', line)
          }
        }
      })

      botProcess.stderr.on('data', (data) => {
        const str = data.toString()
        if (!str.includes('ExperimentalWarning')) {
          sendEvent('error', str)
        }
      })

      botProcess.on('close', (code) => {
        if (code === 0) {
          // Try to extract JSON result from output
          const jsonMatch = output.match(/__RESULT_JSON__\s*\n([\s\S]*?)$/m)
          if (jsonMatch && jsonMatch[1]) {
            try {
              const results = JSON.parse(jsonMatch[1].trim())
              sendEvent('complete', JSON.stringify(results))
            } catch {
              sendEvent('complete', JSON.stringify({ processed: packageIds.length, success: packageIds.length, errors: 0 }))
            }
          } else {
            sendEvent('complete', JSON.stringify({ processed: packageIds.length, success: packageIds.length, errors: 0 }))
          }
        } else {
          sendEvent('failed', `Proceso terminó con código ${code}`)
        }
        controller.close()
      })

      botProcess.on('error', (err) => {
        sendEvent('failed', err.message)
        controller.close()
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
