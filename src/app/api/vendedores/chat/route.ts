import { NextResponse } from 'next/server'
import { getAnthropicClient } from '@/lib/anthropic/client'
import type { VendedoresData } from '@/lib/google-sheets/client'

export async function POST(request: Request) {
  try {
    console.log('[Chat] Received request')
    const body = await request.json() as {
      messages: { role: 'user' | 'assistant'; content: string }[]
      data: VendedoresData
    }
    const { messages, data } = body

    console.log('[Chat] Messages count:', messages?.length)
    console.log('[Chat] Last message:', messages?.[messages.length - 1]?.content?.slice(0, 100))
    console.log('[Chat] Has data:', !!data, 'Vendedores:', data?.vendedores?.length)

    if (!messages || messages.length === 0) {
      console.log('[Chat] No messages provided')
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 })
    }

    console.log('[Chat] Getting Anthropic client...')
    const anthropic = getAnthropicClient()
    console.log('[Chat] Client OK')

    // Build a concise data summary for the system prompt
    const dataSummary = buildDataSummary(data)
    console.log('[Chat] Data summary length:', dataSummary.length)

    console.log('[Chat] Calling Anthropic stream...')
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      system: `Eres un analista de ventas experto de la agencia de viajes "Sí, Viajo" con sede en Argentina.
Tienes acceso a los datos de rendimiento del equipo comercial. Responde siempre en español.

Datos actuales del equipo:
${dataSummary}

Instrucciones:
- Da respuestas concretas con números específicos
- Usa formato de moneda USD cuando hables de montos
- Destaca tendencias positivas y negativas
- Sugiere acciones cuando sea relevante
- Si te piden rankings, ordena de mayor a menor salvo que indiquen lo contrario
- Sé conciso pero completo`,
      messages: messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    })

    // Convert to ReadableStream for SSE
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          console.log('[Chat] Stream started')
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`))
            }
          }
          console.log('[Chat] Stream completed')
          controller.enqueue(encoder.encode('data: [DONE]\n\n'))
          controller.close()
        } catch (err) {
          console.error('[Chat] Stream error:', err)
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Stream error' })}\n\n`))
          controller.close()
        }
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  } catch (error: unknown) {
    const errMsg = error instanceof Error ? error.message : String(error)
    const errStack = error instanceof Error ? error.stack : ''
    console.error('[Chat] FATAL ERROR:', errMsg)
    console.error('[Chat] Stack:', errStack)
    return NextResponse.json(
      { error: `Failed to process chat request: ${errMsg}` },
      { status: 500 }
    )
  }
}

function buildDataSummary(data: VendedoresData): string {
  const lines: string[] = []

  lines.push(`Meses disponibles: ${data.availableMonths.join(', ')}`)
  lines.push('')

  // Team summaries
  for (const team of data.teams) {
    lines.push(`## Equipo ${team.equipo}`)
    for (const md of team.monthlyData) {
      if (md.objetivo > 0 || md.producido > 0) {
        lines.push(`  ${md.month}: Obj USD ${md.objetivo.toLocaleString()} | Prod USD ${md.producido.toLocaleString()} | ${md.porcentaje.toFixed(1)}%`)
      }
    }
    lines.push('')
  }

  // Individual vendedores
  lines.push('## Vendedores individuales')
  for (const v of data.vendedores) {
    lines.push(`\n### ${v.nombre} (${v.equipo})`)
    for (const md of v.monthlyData) {
      if (md.objetivo > 0 || md.producido > 0) {
        let line = `  ${md.month}: Obj USD ${md.objetivo.toLocaleString()} | Prod USD ${md.producido.toLocaleString()} | ${md.porcentaje.toFixed(1)}%`
        if (md.qVentas !== undefined) {
          line += ` | Ventas: ${md.qVentas} | Chicas: ${md.qChicas}`
        }
        lines.push(line)
      }
    }
  }

  return lines.join('\n')
}
