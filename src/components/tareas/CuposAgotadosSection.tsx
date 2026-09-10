'use client'

import { useState, useEffect, useCallback } from 'react'
import { publicPackageUrl } from '@/lib/packages/public-url'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, EyeOff, Plane, RefreshCw, ExternalLink, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CupoAgotadoTask } from '@/app/api/tareas/cupos-agotados/route'

export function CuposAgotadosSection({ onCountChange }: { onCountChange?: (n: number) => void }) {
  const [tasks, setTasks] = useState<CupoAgotadoTask[]>([])
  const [loading, setLoading] = useState(true)
  const [resolving, setResolving] = useState<string | null>(null)

  const fetchTasks = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/tareas/cupos-agotados')
      const data = await res.json()
      if (res.ok) {
        setTasks(data.tasks || [])
        onCountChange?.((data.tasks || []).reduce((n: number, t: CupoAgotadoTask) => n + t.packages.length, 0))
      } else {
        toast.error(data.error || 'Error al cargar los cupos agotados')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }, [onCountChange])

  useEffect(() => {
    fetchTasks()
  }, [fetchTasks])

  const resolve = async (task: CupoAgotadoTask, packageId: number, decision: 'deactivate' | 'keep') => {
    const key = `${task.flightId}-${packageId}`
    setResolving(key)
    try {
      const res = await fetch('/api/tareas/cupos-agotados/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightId: task.flightId, packageId, decision }),
      })
      const data = await res.json()

      if (!res.ok) {
        toast.error(data.error || 'No se pudo resolver')
        return
      }

      if (data.tcError) toast.warning(data.message)
      else toast.success(data.message)
      if (data.noticeSkipped) toast.info(`Aviso a marketing: ${data.noticeSkipped}`)

      await fetchTasks()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setResolving(null)
    }
  }

  const formatDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (tasks.length === 0) {
    return (
      <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
        <CheckCircle2 className="h-5 w-5 text-green-600" />
        No hay cupos agotados con paquetes publicados
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {tasks.map(task => (
        <Card key={task.flightId} className="border-red-200">
          <CardContent className="pt-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Plane className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold">{task.baseId}</span>
                  <Badge variant="secondary" className="text-xs">{task.route}</Badge>
                  {task.supplierName && (
                    <span className="text-xs text-muted-foreground">{task.supplierName}</span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Sale {formatDate(task.departureDate)}
                  {task.returnDate && ` · vuelve ${formatDate(task.returnDate)}`}
                </p>
              </div>
              <Badge variant="outline" className="bg-red-100 text-red-700 border-red-200">
                {task.cupos.sold} de {task.cupos.total} vendidos · sin lugares
              </Badge>
            </div>

            <div className="mt-4 divide-y border-t">
              {task.packages.map(pkg => {
                const key = `${task.flightId}-${pkg.packageId}`
                const busy = resolving === key
                return (
                  <div key={pkg.packageId} className="py-3 flex items-center justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <a
                          href={publicPackageUrl(pkg.tcPackageId, pkg.title)}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Abrir el paquete en siviajo.com"
                          className="font-mono text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          {pkg.tcPackageId}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <a href={`/packages/${pkg.packageId}`} className="text-[11px] text-gray-400 hover:underline" title="Ver en HUB">HUB</a>
                        <span className="text-sm truncate">{pkg.title}</span>
                        {pkg.sendToMarketing && (
                          <Badge variant="secondary" className="text-xs">en marketing</Badge>
                        )}
                        {pkg.confidence === 'media' && (
                          <Badge
                            variant="outline"
                            className="text-xs bg-amber-50 text-amber-700 border-amber-200"
                            title="Se relacionó por ruta y fecha, sin número de vuelo: verificá que sea el cupo correcto"
                          >
                            match por ruta
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => resolve(task, pkg.packageId, 'deactivate')}
                      >
                        <EyeOff className="h-4 w-4 mr-1" />
                        No visible
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        onClick={() => resolve(task, pkg.packageId, 'keep')}
                        title="Se le va a cambiar el aéreo: sale de esta lista"
                      >
                        Mantener visible
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              &quot;No visible&quot; desactiva el paquete en TravelCompositor y avisa a marketing para
              que baje los anuncios. &quot;Mantener visible&quot; solo lo saca de esta lista.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
