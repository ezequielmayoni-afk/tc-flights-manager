'use client'

import { useState } from 'react'
import { toast } from 'sonner'

interface Props {
  /** Texto que se le manda al cotizador: el nombre del destino. */
  name: string
  /** El código que tenemos guardado; si no coincide, el barrido sondea otra ciudad. */
  tcCode: string
}

type ResolveResponse =
  | { status: 'ok'; code: string; label: string; valorForm: string }
  | { status: 'no_resuelto'; motivo: string }
  | { error: string }

/** `mismatch` es el único caso rojo: sabemos que el código guardado está mal. */
type Estado = 'idle' | 'ok' | 'mismatch' | 'unknown'

const ETIQUETA: Record<Estado, string> = {
  idle: 'Verificar código TC',
  ok: 'Código TC ✓',
  mismatch: 'Código TC ✗',
  unknown: 'No verificable',
}

const ESTILO: Record<Estado, string> = {
  idle: 'border-gray-300 text-gray-600 hover:bg-gray-50',
  ok: 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  mismatch: 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100',
  unknown: 'border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100',
}

/**
 * "Verificar código TC": le pregunta al cotizador a qué destino de Travel
 * Compositor resuelve el nombre.
 *
 * `tc_code` no es el IATA del aeropuerto: es el código de destino de TC, y si
 * está mal el barrido cotiza otra ciudad sin fallar. Por eso se verifica antes
 * de publicar.
 */
export function ResolveCodeButton({ name, tcCode }: Props) {
  const [busy, setBusy] = useState(false)
  const [estado, setEstado] = useState<Estado>('idle')

  async function resolve() {
    setBusy(true)
    try {
      const res = await fetch('/api/vuelos-baratos/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: name }),
      })
      const body = (await res.json().catch(() => null)) as ResolveResponse | null
      if (!res.ok || !body) throw new Error((body && 'error' in body ? body.error : null) ?? 'No se pudo resolver')

      if (!('status' in body) || body.status !== 'ok') {
        // No resolver no dice que el código esté mal, sólo que no se pudo
        // comprobar: el rojo se guarda para el desacuerdo real.
        setEstado('unknown')
        toast.warning(`No se pudo verificar ${tcCode}: ${'status' in body ? body.motivo : 'el cotizador no resolvió el destino'}`)
        return
      }

      const coincide = body.code.toUpperCase() === tcCode.toUpperCase()
      setEstado(coincide ? 'ok' : 'mismatch')
      if (coincide) toast.success(`${name} → ${body.code} · ${body.valorForm}`)
      else toast.error(`${name} resuelve a ${body.code} (${body.valorForm}), no a ${tcCode}`)
    } catch (err) {
      setEstado('unknown')
      toast.error(err instanceof Error ? err.message : 'No se pudo resolver')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={resolve}
      disabled={busy}
      title={`Le pregunta al cotizador a qué código de Travel Compositor resuelve “${name}”`}
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${ESTILO[estado]}`}
    >
      {busy ? 'Verificando…' : ETIQUETA[estado]}
    </button>
  )
}
