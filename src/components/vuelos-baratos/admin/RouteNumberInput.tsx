'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

interface Props {
  routeId: number
  /** Columna de `flight_landing_routes` que edita este campo. */
  field: 'probes_per_month' | 'scan_per_month' | 'confirm_per_month'
  value: number
  min: number
  max: number
  /** Cómo se llama el número: "Sondas por mes", "Estimaciones de Sabre por mes". */
  label: string
  /** Cómo se nombra la ruta en el toast: "BUE→MIA". */
  entity: string
}

/**
 * Un cupo de la ruta: sondas, estimaciones de Sabre o confirmaciones por mes.
 *
 * Son las perillas que deciden cuántas llamadas hace la noche (cupo × meses ×
 * rutas), así que guardan al salir del campo y no en cada tecla. Los topes son
 * los mismos que los CHECK de la tabla.
 */
export function RouteNumberInput({ routeId, field, value, min, max, label, entity }: Props) {
  const router = useRouter()
  const [text, setText] = useState(String(value))
  const [busy, setBusy] = useState(false)

  useEffect(() => setText(String(value)), [value])

  async function save() {
    const next = Number(text)
    if (!Number.isInteger(next) || next < min || next > max) {
      setText(String(value))
      toast.error(`${label}: un entero entre ${min} y ${max}`)
      return
    }
    if (next === value) return

    setBusy(true)
    try {
      const res = await fetch(`/api/vuelos-baratos/routes/${routeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar')
      toast.success(`${entity}: ${next} · ${label.toLowerCase()}`)
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
      min={min}
      max={max}
      value={text}
      disabled={busy}
      onChange={e => setText(e.target.value)}
      onBlur={save}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') setText(String(value))
      }}
      aria-label={label}
      className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm tabular-nums focus:border-[#1A237E] focus:outline-none disabled:opacity-50"
    />
  )
}
