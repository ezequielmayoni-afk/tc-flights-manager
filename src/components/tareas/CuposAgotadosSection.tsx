'use client'

import { useState, useEffect, useCallback } from 'react'
import { publicPackageUrl } from '@/lib/packages/public-url'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { AlertTriangle, EyeOff, Plane, RefreshCw, ExternalLink, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import type { CupoAgotadoTask, CupoAlternative } from '@/app/api/tareas/cupos-agotados/route'

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

  const resolve = async (task: CupoAgotadoTask, packageId: number, decision: 'deactivate' | 'keep' | 'switch_to_system') => {
    if (decision === 'switch_to_system' && !window.confirm('¿Ya cambiaste el aéreo en TC?\n\nAntes de tocar esto, en el paquete vacacional de siviajo.com: sacale el "fijo" al aéreo, buscá la tarifa de sistema similar, actualizá y guardá.\n\nHUB va a releer el paquete, sacarlo de cupo y prender el monitoreo con el precio nuevo. El ID, la URL y los anuncios no cambian.')) return
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

  const [altBusy, setAltBusy] = useState<number | null>(null)

  /** Pide la mejor fecha de la misma temporada; el cotizador tarda 1 a 3 minutos y la lista se refresca sola. */
  const searchAlternative = async (packageId: number) => {
    setAltBusy(packageId)
    try {
      const res = await fetch('/api/requote/alternatives', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageId, trigger: 'cupo_sold_out' }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo encolar la búsqueda')
      toast.success(data.deduped ? 'Ya había una búsqueda en curso' : 'Buscando la mejor fecha de la temporada con el cotizador (1 a 3 minutos)')
      await fetchTasks()
      let ticks = 0
      const timer = setInterval(async () => { ticks++; await fetchTasks(); if (ticks >= 12) clearInterval(timer) }, 20000)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setAltBusy(null)
    }
  }

  const decideAlternative = async (alt: CupoAlternative, action: 'approve' | 'reject' | 'apply' | 'prepare') => {
    if (action === 'apply' && !window.confirm(`¿Aplicar la fecha ${alt.proposedDeparture ? formatDate(alt.proposedDeparture) : ''} en siviajo.com?\n\nEl bot abre el rango de fechas del paquete en el backoffice, rehace la búsqueda con la fecha nueva, elige el aéreo de sistema propuesto, toca "Actualizar y guardar idea" y HUB pasa el paquete a sistema con monitoreo. Tarda 3 a 6 minutos. El ID, la URL y los anuncios no cambian.`)) return
    setAltBusy(alt.id)
    try {
      const res = await fetch(`/api/requote/alternatives/${alt.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'No se pudo guardar')
      toast.success(action === 'approve' ? 'Fecha aprobada: ahora podés ensayarla o aplicarla en siviajo.com' : action === 'reject' ? 'Propuesta rechazada' : action === 'apply' ? 'Aplicando en siviajo.com (3 a 6 minutos); la lista se refresca sola' : 'Ensayo en curso (3 a 6 minutos): no guarda nada, muestra qué saldría')
      if (action === 'apply' || action === 'prepare') { let ticks = 0; const timer = setInterval(async () => { ticks++; await fetchTasks(); if (ticks >= 24) clearInterval(timer) }, 20000) }
      await fetchTasks()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error')
    } finally {
      setAltBusy(null)
    }
  }

  const money = (v: number | null) => v === null ? '?' : `USD ${Math.round(v).toLocaleString('es-AR')}`

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
                        <a href={`/packages?q=${pkg.tcPackageId}`} className="text-[11px] text-gray-400 hover:underline" title="Ver en HUB">HUB</a>
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
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() => resolve(task, pkg.packageId, 'switch_to_system')}
                        title="Ya reemplazaste el cupo por una tarifa de sistema en TC: HUB relee el paquete, lo saca de cupo y prende el monitoreo"
                      >
                        <Plane className="h-4 w-4 mr-1" />
                        Pasó a sistema
                      </Button>
                    </div>

                    <div className="basis-full mt-2 rounded-md border border-dashed border-gray-200 bg-gray-50/60 px-3 py-2 text-xs">
                      {pkg.searching ? (
                        <span className="inline-flex items-center gap-1 text-muted-foreground"><RefreshCw className="h-3 w-3 animate-spin" /> Buscando la mejor fecha de la temporada con el cotizador…</span>
                      ) : pkg.alternative && pkg.alternative.status !== 'failed' ? (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <span className="font-medium text-gray-800">Fecha alternativa ({pkg.alternative.seasonKind === 'alta' ? 'temporada alta' : 'temporada baja'}):</span>{' '}
                            sale {pkg.alternative.proposedDeparture ? formatDate(pkg.alternative.proposedDeparture) : '?'}{pkg.alternative.proposedReturn ? ` → ${formatDate(pkg.alternative.proposedReturn)}` : ''}
                            {' · '}{pkg.alternative.airline ?? 'aéreo ?'} {pkg.alternative.flightNumbers.join('/')} {pkg.alternative.direct === true ? 'directo' : pkg.alternative.direct === false ? 'con escala' : ''}
                            {' · '}<span className="font-medium">{money(pkg.alternative.pricePp)} pp</span>
                            {pkg.alternative.variancePct !== null && <span className={pkg.alternative.variancePct > 0 ? 'text-red-600' : 'text-emerald-700'}> ({pkg.alternative.variancePct > 0 ? '+' : ''}{pkg.alternative.variancePct}% vs {money(pkg.alternative.currentPricePp)})</span>}
                            {pkg.alternative.hotelMatched === false && <span className="text-amber-700"> · el hotel del paquete no apareció en esa fecha</span>}
                            {pkg.alternative.note && <span className="block text-muted-foreground">{pkg.alternative.note}</span>}
                            <span className="block text-[11px] text-muted-foreground">Estado: {pkg.alternative.status === 'proposed' ? 'propuesta' : pkg.alternative.status === 'approved' ? 'aprobada: ensayala o aplicala en siviajo.com' : pkg.alternative.status === 'applying' ? 'el bot está trabajando en siviajo.com…' : pkg.alternative.status === 'applied' ? 'aplicada en siviajo.com y pasada a sistema' : pkg.alternative.status}</span>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {pkg.alternative.status === 'proposed' && (
                              <>
                                <Button size="sm" variant="default" disabled={altBusy !== null} onClick={() => decideAlternative(pkg.alternative!, 'approve')}>Aprobar fecha</Button>
                                <Button size="sm" variant="ghost" disabled={altBusy !== null} onClick={() => decideAlternative(pkg.alternative!, 'reject')}>Rechazar</Button>
                              </>
                            )}
                            {pkg.alternative.status === 'approved' && (
                              <>
                                <Button size="sm" variant="outline" disabled={altBusy !== null} onClick={() => decideAlternative(pkg.alternative!, 'prepare')} title="Hace todo en siviajo.com menos guardar, y deja las fechas como estaban">Ensayar</Button>
                                <Button size="sm" variant="default" disabled={altBusy !== null} onClick={() => decideAlternative(pkg.alternative!, 'apply')} title="Aplica la fecha en siviajo.com y pasa el paquete a sistema">Aplicar en siviajo.com</Button>
                                <Button size="sm" variant="ghost" disabled={altBusy !== null} onClick={() => decideAlternative(pkg.alternative!, 'reject')}>Rechazar</Button>
                              </>
                            )}
                            <Button size="sm" variant="outline" disabled={altBusy !== null} onClick={() => searchAlternative(pkg.packageId)} title="Volver a cotizar la temporada">Buscar de nuevo</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-muted-foreground">
                            {pkg.alternative?.status === 'failed' ? `Sin fecha alternativa: ${pkg.alternative.reason ?? 'el cotizador no devolvió precio'}` : 'Sin fecha alternativa buscada todavía.'}
                          </span>
                          <Button size="sm" variant="outline" disabled={altBusy !== null} onClick={() => searchAlternative(pkg.packageId)} title="Le pide al cotizador la mejor fecha de la misma temporada del perfil, con el mismo hotel y pasajeros, con aéreo de sistema">
                            Buscar fecha en la temporada
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            <p className="text-xs text-muted-foreground mt-3 flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              &quot;No visible&quot; desactiva el paquete en TravelCompositor y avisa a marketing para
              que baje los anuncios. &quot;Mantener visible&quot; solo lo saca de esta lista. &quot;Pasó a sistema&quot; es para
              cuando ya cambiaste el cupo por una tarifa de sistema en TC: conserva ID, URL y anuncios, y prende el monitoreo.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
