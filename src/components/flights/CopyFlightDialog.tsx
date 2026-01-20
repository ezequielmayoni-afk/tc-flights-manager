'use client'

import { useState, useMemo, useEffect } from 'react'
import { Calendar } from '@/components/ui/calendar'
import { es } from 'date-fns/locale'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Loader2, X, Calendar as CalendarIcon, ArrowRight } from 'lucide-react'
import { toast } from 'sonner'

interface FlightData {
  id: number
  base_id: string
  name: string
  airline_code: string
  start_date: string
  end_date: string
  base_adult_rt_price: number
  base_children_rt_price: number
  base_infant_rt_price: number
  leg_type?: 'outbound' | 'return' | null
  paired_flight_id?: number | null
  supplier_id: number
  flight_segments: {
    departure_location_code: string
    arrival_location_code: string
    leg_type?: string
  }[]
  modalities?: {
    modality_inventories?: {
      quantity: number
    }[]
  }[]
}

interface CopyFlightDialogProps {
  flight: FlightData | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

interface CopyEntry {
  startDate: Date
  endDate: Date
  adultPrice: string
  childPrice: string
  infantPrice: string
  seats: string
}

const MONTH_NAMES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']

function formatDateForInput(date: Date): string {
  return date.toISOString().split('T')[0]
}

// Parse date string as local date (not UTC)
function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateDisplay(date: Date): string {
  const day = date.getDate().toString().padStart(2, '0')
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const year = date.getFullYear().toString().slice(-2)
  return `${day}/${month}/${year}`
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setDate(result.getDate() + days)
  return result
}

function getDurationDays(startDate: string, endDate: string): number {
  const start = parseLocalDate(startDate)
  const end = parseLocalDate(endDate)
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
}

// Map day of week number to OPERATIONAL_DAYS value
function getDayName(dayNumber: number): string {
  const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
  return days[dayNumber]
}

export function CopyFlightDialog({ flight, open, onOpenChange, onSuccess }: CopyFlightDialogProps) {
  const [step, setStep] = useState<'calendar' | 'prices'>('calendar')
  const [selectedDates, setSelectedDates] = useState<Date[]>([])
  const [entries, setEntries] = useState<CopyEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [pairedFlight, setPairedFlight] = useState<FlightData | null>(null)

  // Fetch paired flight when dialog opens
  useEffect(() => {
    if (open && flight?.paired_flight_id) {
      fetch(`/api/flights/${flight.paired_flight_id}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => setPairedFlight(data))
        .catch(() => setPairedFlight(null))
    } else {
      setPairedFlight(null)
    }
  }, [open, flight?.paired_flight_id])

  // Calculate original flight duration correctly for paired flights
  // Duration = return departure date - outbound departure date
  const durationDays = useMemo(() => {
    if (!flight) return 7

    // For paired flights, calculate duration between outbound and return start_dates
    if (pairedFlight) {
      const outboundFlight = flight.leg_type === 'outbound' ? flight : pairedFlight
      const returnFlight = flight.leg_type === 'return' ? flight : pairedFlight
      return getDurationDays(outboundFlight.start_date, returnFlight.start_date)
    }

    // Fallback to old calculation for non-paired flights
    return getDurationDays(flight.start_date, flight.end_date)
  }, [flight, pairedFlight])

  // Get original values
  const originalAdultPrice = flight?.base_adult_rt_price ?? 0
  const originalChildPrice = flight?.base_children_rt_price ?? 0
  const originalInfantPrice = flight?.base_infant_rt_price ?? 0
  const originalSeats = flight?.modalities?.[0]?.modality_inventories?.[0]?.quantity ?? 0

  // Get route info
  const segments = flight?.flight_segments || []
  const origin = segments[0]?.departure_location_code || ''
  const destination = segments[segments.length - 1]?.arrival_location_code || ''

  // Reset state when dialog closes
  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setStep('calendar')
      setSelectedDates([])
      setEntries([])
      setPairedFlight(null)
    }
    onOpenChange(isOpen)
  }

  // Handle date selection in calendar
  const handleDateSelect = (dates: Date[] | undefined) => {
    setSelectedDates(dates || [])
  }

  // Move to prices step
  const goToPricesStep = () => {
    if (selectedDates.length === 0) {
      toast.error('Seleccioná al menos una fecha')
      return
    }

    // Create entries with calculated end dates
    const newEntries: CopyEntry[] = selectedDates
      .sort((a, b) => a.getTime() - b.getTime())
      .map(date => ({
        startDate: date,
        endDate: addDays(date, durationDays),
        adultPrice: '',
        childPrice: '',
        infantPrice: '',
        seats: '',
      }))

    setEntries(newEntries)
    setStep('prices')
  }

  // Update entry field
  const updateEntry = (index: number, field: keyof CopyEntry, value: string | Date) => {
    setEntries(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  // Remove entry
  const removeEntry = (index: number) => {
    setEntries(prev => prev.filter((_, i) => i !== index))
    setSelectedDates(prev => prev.filter((_, i) => i !== index))
  }

  // Generate name for a flight copy
  const generateName = (startDate: Date): string => {
    const month = MONTH_NAMES[startDate.getMonth()]
    const year = startDate.getFullYear().toString().slice(-2)
    return `${origin}-${destination} ${month}-${year}`
  }

  // Generate base_id for a flight copy
  const generateBaseId = (startDate: Date): string => {
    const dateStr = formatDateForInput(startDate).replace(/-/g, '')
    return `${flight?.airline_code}-${origin}-${destination}-${dateStr}`
  }

  // Create all flight copies
  const handleCreateCopies = async () => {
    if (!flight || entries.length === 0) return

    setLoading(true)

    try {
      // Fetch complete flight data
      const response = await fetch(`/api/flights/${flight.id}`)
      if (!response.ok) throw new Error('Error al obtener datos del vuelo')
      const originalFlight = await response.json()

      // Check if this is a paired flight - if so, fetch the paired flight too
      let pairedFlightData = null
      if (originalFlight.paired_flight_id) {
        const pairedResponse = await fetch(`/api/flights/${originalFlight.paired_flight_id}`)
        if (pairedResponse.ok) {
          pairedFlightData = await pairedResponse.json()
        }
      }

      // Combine segments from both flights if paired
      let allSegments: Array<{
        departure_location_code: string
        arrival_location_code: string
        departure_time: string
        arrival_time: string
        plus_days: number
        duration_time: string
        model: string
        num_service: string
        sort_order: number
        leg_type: 'outbound' | 'return'
      }> = []

      if (pairedFlightData) {
        // Determine which is outbound and which is return
        const outboundFlight = originalFlight.leg_type === 'outbound' ? originalFlight : pairedFlightData
        const returnFlight = originalFlight.leg_type === 'return' ? originalFlight : pairedFlightData

        // Add outbound segments
        const outboundSegments = (outboundFlight.flight_segments || []).map((s: { departure_location_code: string; arrival_location_code: string; departure_time: string; arrival_time: string; plus_days: number; duration_time: string | null; model: string | null; num_service: string | null; sort_order: number }) => ({
          departure_location_code: s.departure_location_code,
          arrival_location_code: s.arrival_location_code,
          departure_time: s.departure_time,
          arrival_time: s.arrival_time,
          plus_days: s.plus_days,
          duration_time: s.duration_time || '',
          model: s.model || '',
          num_service: s.num_service || '',
          sort_order: s.sort_order,
          leg_type: 'outbound' as const,
        }))

        // Add return segments
        const returnSegments = (returnFlight.flight_segments || []).map((s: { departure_location_code: string; arrival_location_code: string; departure_time: string; arrival_time: string; plus_days: number; duration_time: string | null; model: string | null; num_service: string | null; sort_order: number }) => ({
          departure_location_code: s.departure_location_code,
          arrival_location_code: s.arrival_location_code,
          departure_time: s.departure_time,
          arrival_time: s.arrival_time,
          plus_days: s.plus_days,
          duration_time: s.duration_time || '',
          model: s.model || '',
          num_service: s.num_service || '',
          sort_order: s.sort_order,
          leg_type: 'return' as const,
        }))

        allSegments = [...outboundSegments, ...returnSegments]
      } else {
        // Single flight - use leg_type from segments or default to outbound
        allSegments = (originalFlight.flight_segments || []).map((s: { departure_location_code: string; arrival_location_code: string; departure_time: string; arrival_time: string; plus_days: number; duration_time: string | null; model: string | null; num_service: string | null; sort_order: number; leg_type?: string }) => ({
          departure_location_code: s.departure_location_code,
          arrival_location_code: s.arrival_location_code,
          departure_time: s.departure_time,
          arrival_time: s.arrival_time,
          plus_days: s.plus_days,
          duration_time: s.duration_time || '',
          model: s.model || '',
          num_service: s.num_service || '',
          sort_order: s.sort_order,
          leg_type: (s.leg_type as 'outbound' | 'return') || 'outbound',
        }))
      }

      // Create each copy
      const results = await Promise.all(
        entries.map(async (entry) => {
          const copyData = {
            base_id: generateBaseId(entry.startDate),
            name: generateName(entry.startDate),
            airline_code: originalFlight.airline_code,
            supplier_id: originalFlight.supplier_id,
            transport_type: originalFlight.transport_type,
            active: originalFlight.active,
            price_per_pax: originalFlight.price_per_pax,
            currency: originalFlight.currency,
            base_adult_price: originalFlight.base_adult_price,
            base_children_price: originalFlight.base_children_price,
            base_infant_price: originalFlight.base_infant_price,
            base_adult_rt_price: entry.adultPrice ? parseFloat(entry.adultPrice) : originalAdultPrice,
            base_children_rt_price: entry.childPrice ? parseFloat(entry.childPrice) : originalChildPrice,
            base_infant_rt_price: entry.infantPrice ? parseFloat(entry.infantPrice) : originalInfantPrice,
            adult_taxes_amount: originalFlight.adult_taxes_amount,
            children_taxes_amount: originalFlight.children_taxes_amount,
            infant_taxes_amount: originalFlight.infant_taxes_amount,
            adult_rt_taxes_amount: originalFlight.adult_rt_taxes_amount,
            children_rt_taxes_amount: originalFlight.children_rt_taxes_amount,
            infant_rt_taxes_amount: originalFlight.infant_rt_taxes_amount,
            // New schema: separate dates for outbound and return
            outbound_date: formatDateForInput(entry.startDate),
            return_date: formatDateForInput(entry.endDate),
            release_contract: originalFlight.release_contract,
            // Set operational days based on the new dates
            outbound_operational_days: [getDayName(entry.startDate.getDay())],
            return_operational_days: [getDayName(entry.endDate.getDay())],
            option_codes: originalFlight.option_codes,
            only_holiday_package: originalFlight.only_holiday_package,
            show_in_transport_quotas_landing: originalFlight.show_in_transport_quotas_landing,
            min_child_age: originalFlight.min_child_age,
            max_child_age: originalFlight.max_child_age,
            min_infant_age: originalFlight.min_infant_age,
            max_infant_age: originalFlight.max_infant_age,
            allow_ow_price: originalFlight.allow_ow_price,
            allow_rt_price: originalFlight.allow_rt_price,
            product_types: originalFlight.product_types,
            combinable_rt_contracts: [], // Don't copy combinable contracts - will be set on sync
            segments: allSegments,
            datasheets: (originalFlight.flight_datasheets || []).map((d: { language: string; name: string | null; description: string | null }) => ({
              language: d.language,
              name: d.name || '',
              description: d.description || '',
            })),
            cancellations: (originalFlight.flight_cancellations || []).map((c: { days: number; percentage: number }) => ({
              days: c.days,
              percentage: Number(c.percentage),
            })),
            modality: originalFlight.modalities?.[0] ? {
              code: originalFlight.modalities[0].code.replace(/-IDA$|-VUELTA$/, ''), // Remove suffix
              active: originalFlight.modalities[0].active,
              cabin_class_type: originalFlight.modalities[0].cabin_class_type,
              includes_backpack: originalFlight.modalities[0].includes_backpack || false,
              carryon_weight: originalFlight.modalities[0].carryon_weight || 0,
              checked_bag_weight: originalFlight.modalities[0].checked_bag_weight || 0,
              checked_bags_quantity: originalFlight.modalities[0].checked_bags_quantity || 1,
              min_passengers: originalFlight.modalities[0].min_passengers || 1,
              max_passengers: originalFlight.modalities[0].max_passengers || 10,
              on_request: originalFlight.modalities[0].on_request || false,
              quantity: entry.seats ? parseInt(entry.seats) : originalSeats,
            } : undefined,
          }

          const createResponse = await fetch('/api/flights', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(copyData),
          })

          if (!createResponse.ok) {
            const error = await createResponse.json()
            throw new Error(error.error || 'Error al crear copia')
          }

          return createResponse.json()
        })
      )

      // Count total flights created (paired flights create 2 each)
      const totalFlights = results.reduce((acc, r) => acc + (r.outboundId ? 2 : 1), 0)
      toast.success(`${totalFlights} vuelo(s) creado(s) exitosamente${pairedFlightData ? ' (Ida + Vuelta)' : ''}`)
      handleOpenChange(false)
      onSuccess()
    } catch (error) {
      console.error('Error creating copies:', error)
      toast.error(error instanceof Error ? error.message : 'Error al crear copias')
    } finally {
      setLoading(false)
    }
  }

  // Memoized selected dates for calendar
  const calendarSelected = useMemo(() => selectedDates, [selectedDates])

  if (!flight) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="!max-w-6xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Copiar cupo: {flight.name}
          </DialogTitle>
          <DialogDescription>
            {step === 'calendar'
              ? 'Seleccioná las fechas de salida para las copias'
              : `Configurá precios y asientos para ${entries.length} copia(s)`
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'calendar' && (
          <div className="py-4">
            <div className="flex justify-center">
              <Calendar
                mode="multiple"
                selected={calendarSelected}
                onSelect={handleDateSelect}
                numberOfMonths={3}
                disabled={{ before: new Date() }}
                locale={es}
                className="rounded-md border p-4"
              />
            </div>

            {selectedDates.length > 0 && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <p className="text-sm font-medium mb-2">
                  {selectedDates.length} fecha(s) seleccionada(s):
                </p>
                <div className="flex flex-wrap gap-2">
                  {selectedDates
                    .sort((a, b) => a.getTime() - b.getTime())
                    .map((date, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center px-2 py-1 bg-background rounded text-sm"
                      >
                        <CalendarIcon className="h-3 w-3 mr-1" />
                        {formatDateDisplay(date)}
                        <ArrowRight className="h-3 w-3 mx-1 text-muted-foreground" />
                        {formatDateDisplay(addDays(date, durationDays))}
                      </span>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'prices' && (
          <div className="py-4">
            <div className="text-sm text-muted-foreground mb-4">
              Los valores entre paréntesis son los del vuelo original. Dejá vacío para usar el original.
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Salida</TableHead>
                  <TableHead>Regreso</TableHead>
                  <TableHead>Adulto ({originalAdultPrice})</TableHead>
                  <TableHead>Niño ({originalChildPrice})</TableHead>
                  <TableHead>Bebé ({originalInfantPrice})</TableHead>
                  <TableHead>Asientos ({originalSeats})</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      {formatDateDisplay(entry.startDate)}
                    </TableCell>
                    <TableCell>
                      <Input
                        type="date"
                        value={formatDateForInput(entry.endDate)}
                        onChange={(e) => updateEntry(index, 'endDate', new Date(e.target.value))}
                        className="w-40"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={originalAdultPrice.toString()}
                        value={entry.adultPrice}
                        onChange={(e) => updateEntry(index, 'adultPrice', e.target.value)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={originalChildPrice.toString()}
                        value={entry.childPrice}
                        onChange={(e) => updateEntry(index, 'childPrice', e.target.value)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder={originalInfantPrice.toString()}
                        value={entry.infantPrice}
                        onChange={(e) => updateEntry(index, 'infantPrice', e.target.value)}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        placeholder={originalSeats.toString()}
                        value={entry.seats}
                        onChange={(e) => updateEntry(index, 'seats', e.target.value)}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeEntry(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="mt-4 p-3 bg-muted rounded-lg">
              <Label className="text-sm font-medium">Vista previa de nombres:</Label>
              <div className="mt-2 flex flex-wrap gap-2">
                {entries.map((entry, i) => (
                  <span key={i} className="text-sm px-2 py-1 bg-background rounded">
                    {generateName(entry.startDate)}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'prices' && (
            <Button
              variant="outline"
              onClick={() => setStep('calendar')}
              disabled={loading}
            >
              Volver
            </Button>
          )}

          {step === 'calendar' ? (
            <Button onClick={goToPricesStep} disabled={selectedDates.length === 0}>
              Continuar ({selectedDates.length} fechas)
            </Button>
          ) : (
            <Button onClick={handleCreateCopies} disabled={loading || entries.length === 0}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creando...
                </>
              ) : (
                `Crear ${entries.length} vuelo(s)`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
