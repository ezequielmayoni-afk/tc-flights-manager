'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Mail } from 'lucide-react'
import { toast } from 'sonner'

type Preview = { subject: string; html: string; text: string; from: string | null; fromName: string | null; cc: string[]; to: Array<{ airline: string; name: string | null; email: string }>; options: number }

/** Botón "Ver mail": muestra cómo le llega el pedido a aéreos. No envía nada. */
export function CupoMailPreview({ requestId }: { requestId: number }) {
  const [open, setOpen] = useState(false)
  const [p, setP] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(false)
  const show = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/cupos/requests/${requestId}/mail`)
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo armar el mail'); return }
      setP(data); setOpen(true)
    } catch { toast.error('Error de conexión') } finally { setLoading(false) }
  }
  return (
    <>
      <Button size="sm" variant="outline" onClick={show} disabled={loading}>{loading ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Mail className="h-3.5 w-3.5 mr-1" />}Ver mail</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Mail del pedido a aéreos</DialogTitle></DialogHeader>
          {p && (
            <div className="space-y-3 text-sm">
              <div className="rounded border bg-muted/30 p-3 space-y-1 text-xs">
                <div><b>De:</b> {p.from ? `${p.fromName ? `${p.fromName} ` : ''}<${p.from}>` : <span className="text-amber-700">sin casilla configurada (Aéreos → Contactos)</span>}</div>
                <div><b>Para:</b> {p.to.length ? p.to.map(t => `${t.airline}${t.name ? ` (${t.name})` : ''} <${t.email}>`).join(', ') : <span className="text-amber-700">sin contactos de aerolínea cargados</span>}</div>
                {p.cc.length > 0 && <div><b>CC:</b> {p.cc.join(', ')}</div>}
                <div><b>Asunto:</b> {p.subject}</div>
              </div>
              {p.options === 0 ? <p className="text-muted-foreground">Todavía no hay tiradas para pedir: armalas primero.</p> : <div className="rounded border p-4 bg-white" dangerouslySetInnerHTML={{ __html: p.html }} />}
              <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(`${p.subject}\n\n${p.text}`).then(() => toast.success('Mail copiado')).catch(() => toast.error('No se pudo copiar')) }}>Copiar texto</Button></div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
