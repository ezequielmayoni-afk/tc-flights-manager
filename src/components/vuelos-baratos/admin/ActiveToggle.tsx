'use client'

import { useEffect, useId, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface Props {
  /** Endpoint PATCH que recibe `{ active }` (destino o ruta). */
  url: string
  active: boolean
  label: string
  /** Cómo se nombra la cosa en el toast: "Miami", "BUE→MIA". */
  entity: string
  /**
   * Sólo las rutas: activar una manda sondas todas las noches, así que pide
   * confirmación con la cuenta a la vista. Apagarla no pregunta nada.
   */
  confirmActivation?: { probesPerMonth: number; monthsAhead: number }
}

/**
 * Interruptor de publicación: "Publicado" en el destino, "Activa" en la ruta.
 *
 * Se pinta al toque y se revierte si el PATCH falla; el `router.refresh()`
 * vuelve a traer la fila del servidor, que es la que manda.
 */
export function ActiveToggle({ url, active, label, entity, confirmActivation }: Props) {
  const router = useRouter()
  const id = useId()
  const [checked, setChecked] = useState(active)
  const [busy, setBusy] = useState(false)
  const [confirmando, setConfirmando] = useState(false)

  // Tras el refresh el servidor manda: si el valor cambió por otro lado, gana.
  useEffect(() => setChecked(active), [active])

  async function guardar(next: boolean) {
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

  function pedir(next: boolean) {
    // Prender una ruta es lo único que gasta: apagarla o publicar un destino
    // no dispara ninguna búsqueda.
    if (next && confirmActivation) setConfirmando(true)
    else void guardar(next)
  }

  const porNoche = confirmActivation ? confirmActivation.probesPerMonth * confirmActivation.monthsAhead : 0

  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox id={id} checked={checked} disabled={busy} onCheckedChange={value => pedir(value === true)} />
        <Label htmlFor={id} className="cursor-pointer text-xs font-normal text-gray-600">
          {label}
        </Label>
      </div>

      {confirmActivation && (
        <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Activar {entity}?</AlertDialogTitle>
              <AlertDialogDescription>
                Activar esta ruta suma ~{porNoche} búsquedas por noche en siviajo.com. ¿Confirmás?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void guardar(true)}>Activar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
