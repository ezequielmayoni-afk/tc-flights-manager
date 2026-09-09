'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface Props {
  /** Endpoint PATCH que recibe `{ active }` (destino o ruta). */
  url: string
  active: boolean
  label: string
  /** Cómo se nombra la cosa en el toast: "Miami", "BUE→MIA". */
  entity: string
}

/**
 * Interruptor de publicación: "Publicado" en el destino, "Activa" en la ruta.
 *
 * Se pinta al toque y se revierte si el PATCH falla; el `router.refresh()`
 * vuelve a traer la fila del servidor, que es la que manda.
 */
export function ActiveToggle({ url, active, label, entity }: Props) {
  const router = useRouter()
  const id = useId()
  const [checked, setChecked] = useState(active)
  const [busy, setBusy] = useState(false)

  // Tras el refresh el servidor manda: si el valor cambió por otro lado, gana.
  useEffect(() => setChecked(active), [active])

  async function toggle(next: boolean) {
    setChecked(next)
    setBusy(true)
    try {
      const res = await fetch(url, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: next }),
      })
      const body = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar')
      toast.success(`${entity}: ${next ? 'activado' : 'desactivado'}`)
      router.refresh()
    } catch (err) {
      setChecked(active)
      toast.error(err instanceof Error ? err.message : 'No se pudo guardar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={value => toggle(value === true)} />
      <Label htmlFor={id} className="cursor-pointer text-xs font-normal text-gray-600">
        {label}
      </Label>
    </div>
  )
}
