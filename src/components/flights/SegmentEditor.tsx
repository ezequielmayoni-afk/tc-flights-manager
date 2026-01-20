'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Plus, Trash2, GripVertical, ChevronsUpDown, Check, Plane, PlaneLanding } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { FlightSegmentData } from '@/lib/validations/flight'

interface Airport {
  code: string
  name: string
  city: string
}

interface AirportComboboxProps {
  airports: Airport[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

function AirportCombobox({ airports, value, onChange, placeholder = "Buscar aeropuerto..." }: AirportComboboxProps) {
  const [open, setOpen] = useState(false)

  const selectedAirport = airports.find((airport) => airport.code === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          {selectedAirport
            ? `${selectedAirport.code} - ${selectedAirport.city}`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar por código o ciudad..." />
          <CommandList>
            <CommandEmpty>No se encontró aeropuerto.</CommandEmpty>
            <CommandGroup>
              {airports.map((airport) => (
                <CommandItem
                  key={airport.code}
                  value={`${airport.code} ${airport.city} ${airport.name}`}
                  onSelect={() => {
                    onChange(airport.code)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === airport.code ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="font-mono font-medium">{airport.code}</span>
                  <span className="ml-2 text-muted-foreground">
                    {airport.city}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface SegmentEditorProps {
  segments: FlightSegmentData[]
  airports: { code: string; name: string; city: string }[]
  onChange: (segments: FlightSegmentData[]) => void
  legType?: 'outbound' | 'return' // Si se pasa, fuerza el leg_type y oculta los botones de cambio
}

const createEmptySegment = (legType: 'outbound' | 'return' = 'outbound'): FlightSegmentData => ({
  departure_location_code: '',
  arrival_location_code: '',
  departure_time: '00:00',
  arrival_time: '00:00',
  plus_days: 0,
  duration_time: '',
  model: '',
  num_service: '',
  sort_order: 0,
  leg_type: legType,
})

export function SegmentEditor({ segments, airports, onChange, legType }: SegmentEditorProps) {
  const addSegment = () => {
    const lastSegment = segments[segments.length - 1]
    const newSegment: FlightSegmentData = {
      ...createEmptySegment(legType || 'outbound'),
      departure_location_code: lastSegment?.arrival_location_code || '',
      sort_order: segments.length,
      leg_type: legType || lastSegment?.leg_type || 'outbound',
    }
    onChange([...segments, newSegment])
  }

  const removeSegment = (index: number) => {
    const newSegments = segments.filter((_, i) => i !== index)
    onChange(newSegments.map((s, i) => ({ ...s, sort_order: i })))
  }

  const updateSegment = (index: number, field: keyof FlightSegmentData, value: string | number) => {
    const newSegments = [...segments]
    newSegments[index] = {
      ...newSegments[index],
      [field]: value,
    }
    onChange(newSegments)
  }

  return (
    <div className="space-y-4">
      {segments.length === 0 ? (
        <div className="text-center py-8 border-2 border-dashed rounded-lg">
          <p className="text-muted-foreground mb-4">No hay segmentos agregados</p>
          <Button type="button" onClick={addSegment}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar segmento
          </Button>
        </div>
      ) : (
        <>
          {segments.map((segment, index) => (
            <Card key={index} className="relative">
              <div className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground">
                <GripVertical className="h-5 w-5" />
              </div>
              <CardContent className="pt-4 pl-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-muted-foreground">
                      Segmento {index + 1}
                    </span>
                    {/* Solo mostrar badges si no hay legType forzado */}
                    {!legType && (
                      <div className="flex gap-1">
                        <Badge
                          variant={segment.leg_type === 'outbound' ? 'default' : 'outline'}
                          className={cn(
                            "cursor-pointer transition-all",
                            segment.leg_type === 'outbound'
                              ? 'bg-blue-500 hover:bg-blue-600'
                              : 'hover:bg-blue-100'
                          )}
                          onClick={() => updateSegment(index, 'leg_type', 'outbound')}
                        >
                          <Plane className="h-3 w-3 mr-1" />
                          Ida
                        </Badge>
                        <Badge
                          variant={segment.leg_type === 'return' ? 'default' : 'outline'}
                          className={cn(
                            "cursor-pointer transition-all",
                            segment.leg_type === 'return'
                              ? 'bg-purple-500 hover:bg-purple-600'
                              : 'hover:bg-purple-100'
                          )}
                          onClick={() => updateSegment(index, 'leg_type', 'return')}
                        >
                          <PlaneLanding className="h-3 w-3 mr-1" />
                          Vuelta
                        </Badge>
                      </div>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeSegment(index)}
                    className="text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                  <div className="space-y-2">
                    <Label>Origen *</Label>
                    <AirportCombobox
                      airports={airports}
                      value={segment.departure_location_code}
                      onChange={(value) => updateSegment(index, 'departure_location_code', value)}
                      placeholder="Seleccionar origen..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Destino *</Label>
                    <AirportCombobox
                      airports={airports}
                      value={segment.arrival_location_code}
                      onChange={(value) => updateSegment(index, 'arrival_location_code', value)}
                      placeholder="Seleccionar destino..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Hora salida (24hs) *</Label>
                    <Input
                      type="text"
                      placeholder="HH:MM"
                      maxLength={5}
                      value={segment.departure_time.substring(0, 5)}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '')
                        if (val.length === 2 && !val.includes(':')) val += ':'
                        if (val.length <= 5) updateSegment(index, 'departure_time', val)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Hora llegada (24hs) *</Label>
                    <Input
                      type="text"
                      placeholder="HH:MM"
                      maxLength={5}
                      value={segment.arrival_time.substring(0, 5)}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '')
                        if (val.length === 2 && !val.includes(':')) val += ':'
                        if (val.length <= 5) updateSegment(index, 'arrival_time', val)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>+Días</Label>
                    <Input
                      type="number"
                      min="0"
                      value={segment.plus_days}
                      onChange={(e) => updateSegment(index, 'plus_days', parseInt(e.target.value) || 0)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Duración (HH:MM)</Label>
                    <Input
                      type="text"
                      placeholder="HH:MM"
                      maxLength={5}
                      value={segment.duration_time?.substring(0, 5) || ''}
                      onChange={(e) => {
                        let val = e.target.value.replace(/[^\d:]/g, '')
                        if (val.length === 2 && !val.includes(':')) val += ':'
                        if (val.length <= 5) updateSegment(index, 'duration_time', val)
                      }}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Modelo avión</Label>
                    <Input
                      placeholder="Ej: 737-800"
                      value={segment.model || ''}
                      onChange={(e) => updateSegment(index, 'model', e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Nro. Servicio</Label>
                    <Input
                      placeholder="Ej: 1234"
                      value={segment.num_service || ''}
                      onChange={(e) => updateSegment(index, 'num_service', e.target.value)}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button type="button" variant="outline" onClick={addSegment}>
            <Plus className="mr-2 h-4 w-4" />
            Agregar otro segmento
          </Button>
        </>
      )}
    </div>
  )
}
