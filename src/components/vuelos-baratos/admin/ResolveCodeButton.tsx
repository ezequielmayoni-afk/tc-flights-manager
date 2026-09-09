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
  const [mismatch, setMismatch] = useState(false)

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
        setMismatch(true)
        throw new Error(body && 'status' in body ? body.motivo : 'No se pudo resolver')
      }

      const coincide = body.code.toUpperCase() === tcCode.toUpperCase()
      setMismatch(!coincide)
      if (coincide) toast.success(`${name} → ${body.code} · ${body.valorForm}`)
      else toast.error(`${name} resuelve a ${body.code} (${body.valorForm}), no a ${tcCode}`)
    } catch (err) {
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
      className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
        mismatch ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
      }`}
    >
      {busy ? 'Verificando…' : mismatch ? 'Código TC ✗' : 'Verificar código TC'}
    </button>
  )
}
