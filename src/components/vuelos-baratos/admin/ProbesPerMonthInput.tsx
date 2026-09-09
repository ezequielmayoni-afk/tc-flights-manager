'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  routeId: number
  value: number
  /** Cómo se nombra la ruta en el toast: "BUE→MIA". */
  entity: string
}

const MIN = 1
const MAX = 31

/**
 * Sondas por mes de una ruta: el freno look-to-book.
 *
 * Es la perilla que decide cuántas llamadas al cotizador hace la noche
 * (sondas × meses × rutas), así que guarda al salir del campo y no en cada
 * tecla. Los topes son los mismos que el CHECK de la tabla.
 */
export function ProbesPerMonthInput({ routeId, value, entity }: Props) {
  const router = useRouter()
  const [text, setText] = useState(String(value))
  const [busy, setBusy] = useState(false)

  useEffect(() => setText(String(value)), [value])

  async function save() {
    const next = Number(text)
    if (!Number.isInteger(next) || next < MIN || next > MAX) {
      setText(String(value))
      toast.error(`Sondas/mes: un entero entre ${MIN} y ${MAX}`)
      return
    }
    if (next === value) return

    setBusy(true)
    try {
      const res = await fetch(`/api/vuelos-baratos/routes/${routeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ probes_per_month: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar')
      toast.success(`${entity}: ${next} sondas por mes`)
      router.refresh()
    } catch (err) {
      setText(String(value))
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={MIN}
      max={MAX}
      value={text}
      disabled={busy}
      onChange={e => setText(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setText(String(value))
      }}
      aria-label="Sondas por mes"
      className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums focus:border-[#1A237E] focus:outline-none disabled:opacity-50"
    />
  )
}
