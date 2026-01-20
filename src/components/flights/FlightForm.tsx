'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { flightFormSchema, type FlightFormData } from '@/lib/validations/flight'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { SegmentEditor } from './SegmentEditor'
import { DatePicker } from '@/components/ui/date-picker'
import { Loader2, Save, ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

const OPERATIONAL_DAYS = [
  { value: 'MONDAY', label: 'Lunes' },
  { value: 'TUESDAY', label: 'Martes' },
  { value: 'WEDNESDAY', label: 'Miércoles' },
  { value: 'THURSDAY', label: 'Jueves' },
  { value: 'FRIDAY', label: 'Viernes' },
  { value: 'SATURDAY', label: 'Sábado' },
  { value: 'SUNDAY', label: 'Domingo' },
]

const CURRENCIES = ['USD', 'ARS', 'EUR', 'BRL']

const CABIN_CLASSES = [
  { value: 'ECONOMY', label: 'Economy' },
  { value: 'PREMIUM_ECONOMY', label: 'Premium Economy' },
  { value: 'BUSINESS', label: 'Business' },
  { value: 'FIRST', label: 'First Class' },
]

const PRODUCT_TYPES = [
  { value: 'ONLY_FLIGHT', label: 'Transport' },
  { value: 'FLIGHT_HOTEL', label: 'Transport + Hotel' },
  { value: 'MULTI', label: 'Multidestination' },
  { value: 'MAGIC_BOX', label: 'Magic Box' },
  { value: 'ROUTING', label: 'Trip Planner' },
]

interface FlightFormProps {
  initialData?: FlightFormData & { id?: number; tc_transport_id?: string | null; paired_flight_id?: number | null; leg_type?: 'outbound' | 'return' | null }
  airlines: { code: string; name: string }[]
  airports: { code: string; name: string; city: string }[]
  suppliers: { id: number; name: string }[]
}

const defaultModality = {
  code: 'MOD-01',
  active: true,
  cabin_class_type: 'ECONOMY',
  includes_backpack: true,
  carryon_weight: 8,
  checked_bag_weight: 23,
  checked_bags_quantity: 1,
  min_passengers: 1,
  max_passengers: 10,
  on_request: false,
  quantity: 10,
}

// Eliminamos el tab "segments" - ahora los segmentos van dentro de "general"
const TABS = ['general', 'modality', 'prices', 'config'] as const
type TabValue = typeof TABS[number]

export function FlightForm({ initialData, airlines, airports, suppliers: initialSuppliers }: FlightFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncingSuppliers, setSyncingSuppliers] = useState(false)
  const [suppliers, setSuppliers] = useState(initialSuppliers)
  const [error, setError] = useState<string | null>(null)
  const [currentTab, setCurrentTab] = useState<TabValue>('general')
  const [showSyncDialog, setShowSyncDialog] = useState(false)
  const [savedFlightId, setSavedFlightId] = useState<number | null>(null)

  const isEditing = !!initialData?.id
  const isSyncedWithTC = !!initialData?.tc_transport_id

  // Ensure modality has default values when editing
  const formDefaults = initialData
    ? { ...initialData, modality: initialData.modality || defaultModality }
    : {
      supplier_id: 18259, // Default: Sí, viajo
      base_id: '',
      name: '',
      airline_code: '',
      transport_type: 'PLANE',
      active: true,
      price_per_pax: true,
      currency: 'USD',
      base_adult_price: 0,
      base_children_price: 0,
      base_infant_price: 0,
      base_adult_rt_price: 0,
      base_children_rt_price: 0,
      base_infant_rt_price: 0,
      adult_taxes_amount: 0,
      children_taxes_amount: 0,
      infant_taxes_amount: 0,
      adult_rt_taxes_amount: 0,
      children_rt_taxes_amount: 0,
      infant_rt_taxes_amount: 0,
      outbound_date: '',
      return_date: '',
      release_contract: 0,
      outbound_operational_days: [],
      return_operational_days: [],
      option_codes: [],
      only_holiday_package: true,
      show_in_transport_quotas_landing: true,
      min_child_age: 2,
      max_child_age: 11,
      min_infant_age: 0,
      max_infant_age: 2,
      allow_ow_price: false,
      allow_rt_price: true,
      product_types: ['ONLY_FLIGHT', 'FLIGHT_HOTEL', 'MULTI', 'MAGIC_BOX', 'ROUTING'],
      combinable_rt_contracts: [],
      segments: [],
      datasheets: [],
      cancellations: [],
      modality: defaultModality,
    }

  const form = useForm<FlightFormData>({
    resolver: zodResolver(flightFormSchema),
    defaultValues: formDefaults,
  })

  const { register, handleSubmit, watch, setValue, formState: { errors } } = form

  const segments = watch('segments')
  const outboundOperationalDays = watch('outbound_operational_days')
  const returnOperationalDays = watch('return_operational_days')
  const productTypes = watch('product_types')

  // Filtrar segmentos por tipo
  const outboundSegments = segments?.filter(s => s.leg_type === 'outbound') || []
  const returnSegments = segments?.filter(s => s.leg_type === 'return') || []

  const toggleOutboundOperationalDay = (day: string) => {
    const current = outboundOperationalDays || []
    if (current.includes(day)) {
      setValue('outbound_operational_days', current.filter(d => d !== day))
    } else {
      setValue('outbound_operational_days', [...current, day])
    }
  }

  const toggleReturnOperationalDay = (day: string) => {
    const current = returnOperationalDays || []
    if (current.includes(day)) {
      setValue('return_operational_days', current.filter(d => d !== day))
    } else {
      setValue('return_operational_days', [...current, day])
    }
  }

  const toggleProductType = (type: string) => {
    const current = productTypes || []
    if (current.includes(type)) {
      setValue('product_types', current.filter(t => t !== type))
    } else {
      setValue('product_types', [...current, type])
    }
  }

  // Map day of week number to OPERATIONAL_DAYS value
  const getDayName = (dayNumber: number): string => {
    const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY']
    return days[dayNumber]
  }

  // Handle outbound date selection and auto-select operational day
  const handleOutboundDateSelect = (dateValue: string) => {
    if (!dateValue) return

    // Parse date without timezone issues
    const [year, month, day] = dateValue.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    const dayName = getDayName(dayOfWeek)

    // Add the day if not already selected
    const current = form.getValues('outbound_operational_days') || []
    if (!current.includes(dayName)) {
      setValue('outbound_operational_days', [...current, dayName])
    }
  }

  // Handle return date selection and auto-select operational day
  const handleReturnDateSelect = (dateValue: string) => {
    if (!dateValue) return

    // Parse date without timezone issues
    const [year, month, day] = dateValue.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    const dayOfWeek = date.getDay()
    const dayName = getDayName(dayOfWeek)

    // Add the day if not already selected
    const current = form.getValues('return_operational_days') || []
    if (!current.includes(dayName)) {
      setValue('return_operational_days', [...current, dayName])
    }
  }

  // Validate fields for each tab
  const validateTab = async (tab: TabValue): Promise<boolean> => {
    const values = form.getValues()

    switch (tab) {
      case 'general':
        if (!values.base_id || values.base_id.trim() === '') {
          toast.error('El ID Base es requerido')
          return false
        }
        if (!values.name || values.name.trim() === '') {
          toast.error('El Nombre es requerido')
          return false
        }
        if (!values.airline_code) {
          toast.error('La Aerolínea es requerida')
          return false
        }
        if (!values.outbound_date) {
          toast.error('La Fecha de ida es requerida')
          return false
        }
        if (!values.return_date) {
          toast.error('La Fecha de vuelta es requerida')
          return false
        }
        // Validar que haya al menos un segmento
        if (!values.segments || values.segments.length === 0) {
          toast.error('Debe agregar al menos un segmento de vuelo')
          return false
        }
        // Validar que haya segmentos de ida y vuelta
        const hasOutbound = values.segments.some(s => s.leg_type === 'outbound')
        const hasReturn = values.segments.some(s => s.leg_type === 'return')
        if (!hasOutbound) {
          toast.error('Debe agregar al menos un segmento de IDA')
          return false
        }
        if (!hasReturn) {
          toast.error('Debe agregar al menos un segmento de VUELTA')
          return false
        }
        return true

      case 'modality':
        if (!values.modality?.code) {
          toast.error('El código de modalidad es requerido')
          return false
        }
        if (!values.modality?.quantity || values.modality.quantity <= 0) {
          toast.error('La cantidad de asientos debe ser mayor a 0')
          return false
        }
        return true

      case 'prices':
        // Prices can be 0, so no strict validation needed
        return true

      case 'config':
        return true

      default:
        return true
    }
  }

  const goToNextTab = async () => {
    const currentIndex = TABS.indexOf(currentTab)
    if (currentIndex < TABS.length - 1) {
      const isValid = await validateTab(currentTab)
      if (isValid) {
        setCurrentTab(TABS[currentIndex + 1])
      }
    }
  }

  const goToPrevTab = () => {
    const currentIndex = TABS.indexOf(currentTab)
    if (currentIndex > 0) {
      setCurrentTab(TABS[currentIndex - 1])
    }
  }

  const isLastTab = currentTab === 'config'
  const isFirstTab = currentTab === 'general'

  const onSubmit = async (data: FlightFormData) => {
    // Only allow submission from the last tab
    if (currentTab !== 'config') {
      return
    }

    setLoading(true)
    setError(null)

    try {
      const url = isEditing
        ? `/api/flights/${initialData?.id}`
        : '/api/flights'

      const response = await fetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al guardar')
      }

      const result = await response.json()

      // Check if two flights were created (paired outbound/return)
      if (result.message && result.outboundId && result.returnId) {
        toast.success('Se crearon 2 vuelos enlazados: Ida y Vuelta')
        router.push('/flights')
        router.refresh()
      } else {
        toast.success(isEditing ? 'Vuelo actualizado' : 'Vuelo creado')

        // If editing and synced with TC, ask if they want to sync
        if (isEditing && isSyncedWithTC) {
          setSavedFlightId(initialData?.id || null)
          setShowSyncDialog(true)
        } else {
          router.push('/flights')
          router.refresh()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  const handleSyncToTC = async () => {
    if (!savedFlightId) return

    setSyncing(true)
    try {
      // Check if there's a paired flight to sync
      const pairedFlightId = initialData?.paired_flight_id
      const legType = initialData?.leg_type

      console.log('[SYNC DEBUG] Starting sync:', {
        savedFlightId,
        pairedFlightId,
        legType,
        hasPaired: !!pairedFlightId
      })

      if (pairedFlightId) {
        // Determine sync order: return flight first, then outbound for correct linking
        // If current flight is outbound, paired is return
        // If current flight is return, paired is outbound
        const isCurrentOutbound = legType === 'outbound'
        const returnFlightId = isCurrentOutbound ? pairedFlightId : savedFlightId
        const outboundFlightId = isCurrentOutbound ? savedFlightId : pairedFlightId

        console.log('[SYNC DEBUG] Paired flight sync:', {
          isCurrentOutbound,
          returnFlightId,
          outboundFlightId,
          willSyncReturn: true,
          willSyncOutbound: true
        })

        // First sync the return flight
        console.log('[SYNC DEBUG] Syncing RETURN flight:', returnFlightId)
        const returnResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightId: returnFlightId }),
        })

        if (!returnResponse.ok) {
          const errorData = await returnResponse.json()
          console.log('[SYNC DEBUG] RETURN sync FAILED:', errorData)
          throw new Error(errorData.error || 'Error al sincronizar vuelo de vuelta')
        }
        const returnResult = await returnResponse.json()
        console.log('[SYNC DEBUG] RETURN sync SUCCESS:', returnResult)

        // Then sync the outbound flight
        console.log('[SYNC DEBUG] Syncing OUTBOUND flight:', outboundFlightId)
        const outboundResponse = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightId: outboundFlightId }),
        })

        if (!outboundResponse.ok) {
          const errorData = await outboundResponse.json()
          console.log('[SYNC DEBUG] OUTBOUND sync FAILED:', errorData)
          throw new Error(errorData.error || 'Error al sincronizar vuelo de ida')
        }
        const outboundResult = await outboundResponse.json()
        console.log('[SYNC DEBUG] OUTBOUND sync SUCCESS:', outboundResult)
        console.log('[SYNC DEBUG] Both flights synced successfully!')

        toast.success('Ambos vuelos (Ida y Vuelta) sincronizados con TravelCompositor')
      } else {
        // Single flight sync
        const response = await fetch('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightId: savedFlightId }),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error || 'Error al sincronizar')
        }

        toast.success('Vuelo sincronizado con TravelCompositor')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al sincronizar con TC')
    } finally {
      setSyncing(false)
      setShowSyncDialog(false)
      router.push('/flights')
      router.refresh()
    }
  }

  const handleSkipSync = () => {
    setShowSyncDialog(false)
    router.push('/flights')
    router.refresh()
  }

  const handleSyncSuppliers = async () => {
    setSyncingSuppliers(true)
    try {
      const response = await fetch('/api/suppliers/sync', {
        method: 'POST',
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Error al sincronizar proveedores')
      }

      const result = await response.json()
      toast.success(result.message)

      // Refresh the suppliers list
      const suppliersResponse = await fetch('/api/suppliers')
      if (suppliersResponse.ok) {
        const suppliersData = await suppliersResponse.json()
        setSuppliers(suppliersData.suppliers || [])
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al sincronizar proveedores')
    } finally {
      setSyncingSuppliers(false)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs value={currentTab} onValueChange={(v) => setCurrentTab(v as TabValue)} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="modality">Modalidad</TabsTrigger>
          <TabsTrigger value="prices">Precios</TabsTrigger>
          <TabsTrigger value="config">Configuración</TabsTrigger>
        </TabsList>

        {/* TAB: General */}
        <TabsContent value="general" className="space-y-4 mt-4">
          {/* Información compartida */}
          <Card>
            <CardHeader>
              <CardTitle>Información básica</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="base_id">ID Base *</Label>
                <Input
                  id="base_id"
                  {...register('base_id')}
                  placeholder="Ej: VUELO-001"
                />
                {errors.base_id && (
                  <p className="text-sm text-red-500">{errors.base_id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Nombre *</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="Ej: AR-EZE/MIA"
                />
                {errors.name && (
                  <p className="text-sm text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="airline_code">Aerolínea *</Label>
                <Select
                  value={watch('airline_code')}
                  onValueChange={(value) => setValue('airline_code', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar aerolínea" />
                  </SelectTrigger>
                  <SelectContent>
                    {airlines.map((airline) => (
                      <SelectItem key={airline.code} value={airline.code}>
                        {airline.code} - {airline.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.airline_code && (
                  <p className="text-sm text-red-500">{errors.airline_code.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="supplier_id">Proveedor *</Label>
                <div className="flex gap-2">
                  <Select
                    value={watch('supplier_id')?.toString()}
                    onValueChange={(value) => setValue('supplier_id', parseInt(value, 10))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Seleccionar proveedor" />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((supplier) => (
                        <SelectItem key={supplier.id} value={supplier.id.toString()}>
                          {supplier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleSyncSuppliers}
                    disabled={syncingSuppliers}
                    title="Actualizar proveedores desde TravelCompositor"
                  >
                    {syncingSuppliers ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {errors.supplier_id && (
                  <p className="text-sm text-red-500">{errors.supplier_id.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Moneda</Label>
                <Select
                  value={watch('currency')}
                  onValueChange={(value) => setValue('currency', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Motores de búsqueda */}
          <Card>
            <CardHeader>
              <CardTitle>Motores de búsqueda</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-3">
                Seleccione dónde estará disponible este vuelo para la venta
              </p>
              <div className="flex flex-wrap gap-2">
                {PRODUCT_TYPES.map((type) => (
                  <Button
                    key={type.value}
                    type="button"
                    variant={productTypes?.includes(type.value) ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => toggleProductType(type.value)}
                  >
                    {type.label}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ========== SECCIÓN IDA (AZUL) ========== */}
          <Card className="border-blue-500 border-2">
            <CardHeader className="bg-blue-50">
              <CardTitle className="text-blue-700 flex items-center gap-2">
                <span className="bg-blue-500 text-white px-2 py-1 rounded text-sm">IDA</span>
                Vuelo de ida
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Fecha y días operacionales de IDA */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fecha de ida *</Label>
                  <DatePicker
                    value={watch('outbound_date')}
                    onChange={(date) => {
                      setValue('outbound_date', date)
                      handleOutboundDateSelect(date)
                    }}
                    placeholder="Seleccionar fecha de ida"
                  />
                  {errors.outbound_date && (
                    <p className="text-sm text-red-500">{errors.outbound_date.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Días operacionales (IDA)</Label>
                  <div className="flex flex-wrap gap-1">
                    {OPERATIONAL_DAYS.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={outboundOperationalDays?.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        className={outboundOperationalDays?.includes(day.value) ? 'bg-blue-500 hover:bg-blue-600' : ''}
                        onClick={() => toggleOutboundOperationalDay(day.value)}
                      >
                        {day.label.substring(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Segmentos de IDA */}
              <div>
                <Label className="text-blue-700 font-semibold">Segmentos de ida</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Agregue los tramos del vuelo de ida
                </p>
                <SegmentEditor
                  segments={segments?.filter(s => s.leg_type === 'outbound') || []}
                  airports={airports}
                  onChange={(newOutboundSegments) => {
                    const returnSegs = segments?.filter(s => s.leg_type === 'return') || []
                    setValue('segments', [...newOutboundSegments, ...returnSegs])
                  }}
                  legType="outbound"
                />
              </div>
            </CardContent>
          </Card>

          {/* ========== SECCIÓN VUELTA (VIOLETA) ========== */}
          <Card className="border-purple-500 border-2">
            <CardHeader className="bg-purple-50">
              <CardTitle className="text-purple-700 flex items-center gap-2">
                <span className="bg-purple-500 text-white px-2 py-1 rounded text-sm">VUELTA</span>
                Vuelo de vuelta
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 pt-4">
              {/* Fecha y días operacionales de VUELTA */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Fecha de vuelta *</Label>
                  <DatePicker
                    value={watch('return_date')}
                    onChange={(date) => {
                      setValue('return_date', date)
                      handleReturnDateSelect(date)
                    }}
                    placeholder="Seleccionar fecha de vuelta"
                    minDate={watch('outbound_date') || undefined}
                  />
                  {errors.return_date && (
                    <p className="text-sm text-red-500">{errors.return_date.message}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>Días operacionales (VUELTA)</Label>
                  <div className="flex flex-wrap gap-1">
                    {OPERATIONAL_DAYS.map((day) => (
                      <Button
                        key={day.value}
                        type="button"
                        variant={returnOperationalDays?.includes(day.value) ? 'default' : 'outline'}
                        size="sm"
                        className={returnOperationalDays?.includes(day.value) ? 'bg-purple-500 hover:bg-purple-600' : ''}
                        onClick={() => toggleReturnOperationalDay(day.value)}
                      >
                        {day.label.substring(0, 3)}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Segmentos de VUELTA */}
              <div>
                <Label className="text-purple-700 font-semibold">Segmentos de vuelta</Label>
                <p className="text-sm text-muted-foreground mb-2">
                  Agregue los tramos del vuelo de vuelta
                </p>
                <SegmentEditor
                  segments={segments?.filter(s => s.leg_type === 'return') || []}
                  airports={airports}
                  onChange={(newReturnSegments) => {
                    const outboundSegs = segments?.filter(s => s.leg_type === 'outbound') || []
                    setValue('segments', [...outboundSegs, ...newReturnSegments])
                  }}
                  legType="return"
                />
              </div>
            </CardContent>
          </Card>

          {errors.segments && (
            <p className="text-sm text-red-500">
              {errors.segments.message || 'Al menos un segmento de ida y uno de vuelta son requeridos'}
            </p>
          )}
        </TabsContent>

        {/* TAB: Modalidad */}
        <TabsContent value="modality" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Cabina y Equipaje</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Código modalidad *</Label>
                <Input
                  {...register('modality.code')}
                  placeholder="Ej: MOD-ECO-01"
                />
              </div>

              <div className="space-y-2">
                <Label>Tipo de cabina *</Label>
                <Select
                  value={watch('modality.cabin_class_type') || 'ECONOMY'}
                  onValueChange={(value) => setValue('modality.cabin_class_type', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar cabina" />
                  </SelectTrigger>
                  <SelectContent>
                    {CABIN_CLASSES.map((cabin) => (
                      <SelectItem key={cabin.value} value={cabin.value}>
                        {cabin.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Equipaje permitido</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    {...register('modality.includes_backpack')}
                    className="h-4 w-4"
                  />
                  <span>Incluye mochila/artículo personal</span>
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <Label>Carry-on (kg)</Label>
                  <Input
                    type="number"
                    min="0"
                    {...register('modality.carryon_weight', { valueAsNumber: true })}
                    placeholder="Ej: 8"
                  />
                  <p className="text-xs text-muted-foreground">0 = no incluye carry-on</p>
                </div>

                <div className="space-y-2">
                  <Label>Valija despachada (kg)</Label>
                  <Input
                    type="number"
                    min="0"
                    {...register('modality.checked_bag_weight', { valueAsNumber: true })}
                    placeholder="Ej: 23"
                  />
                  <p className="text-xs text-muted-foreground">0 = no incluye valija</p>
                </div>

                <div className="space-y-2">
                  <Label>Cantidad de valijas</Label>
                  <Input
                    type="number"
                    min="0"
                    max="3"
                    {...register('modality.checked_bags_quantity', { valueAsNumber: true })}
                    placeholder="Ej: 1"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventario (lugares disponibles)</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Cantidad de asientos *</Label>
                <Input
                  type="number"
                  min="0"
                  {...register('modality.quantity', { valueAsNumber: true })}
                  placeholder="Ej: 50"
                />
                <p className="text-xs text-muted-foreground">
                  Se aplicará para todo el rango de fechas del vuelo
                </p>
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 mt-6">
                  <input
                    type="checkbox"
                    {...register('modality.on_request')}
                    className="h-4 w-4"
                  />
                  <span>Bajo petición (on request)</span>
                </label>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Precios */}
        <TabsContent value="prices" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Precios Round Trip</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label>Adulto</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('base_adult_rt_price', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Niño</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('base_children_rt_price', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Bebé</Label>
                <Input
                  type="number"
                  step="0.01"
                  {...register('base_infant_rt_price', { valueAsNumber: true })}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB: Configuración */}
        <TabsContent value="config" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Edades</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="space-y-2">
                <Label>Edad mín. niño</Label>
                <Input
                  type="number"
                  {...register('min_child_age', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Edad máx. niño</Label>
                <Input
                  type="number"
                  {...register('max_child_age', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Edad mín. bebé</Label>
                <Input
                  type="number"
                  {...register('min_infant_age', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Edad máx. bebé</Label>
                <Input
                  type="number"
                  {...register('max_infant_age', { valueAsNumber: true })}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Estado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('active')}
                  className="h-4 w-4"
                />
                <span>Activo</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('only_holiday_package')}
                  className="h-4 w-4"
                />
                <span>Solo paquete de vacaciones</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  {...register('show_in_transport_quotas_landing')}
                  className="h-4 w-4"
                />
                <span>Mostrar en el landing de cupos de transporte</span>
              </label>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Vencimiento del cupo</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Días antes del vuelo</Label>
                <Input
                  type="number"
                  {...register('release_contract', { valueAsNumber: true })}
                />
              </div>
              <div className="space-y-2">
                <Label>Option Codes (separados por coma)</Label>
                <Input
                  placeholder="CODE1,CODE2"
                  value={(watch('option_codes') || []).join(',')}
                  onChange={(e) => {
                    const codes = e.target.value.split(',').map(c => c.trim()).filter(Boolean)
                    setValue('option_codes', codes)
                  }}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-between gap-4">
        <div>
          {!isFirstTab && (
            <Button
              type="button"
              variant="outline"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goToPrevTab()
              }}
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Anterior
            </Button>
          )}
        </div>
        <div className="flex gap-4">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancelar
          </Button>
          {isLastTab ? (
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {isEditing ? 'Actualizar' : 'Crear'} vuelo
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                goToNextTab()
              }}
            >
              Siguiente
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Sync to TC Dialog */}
      <AlertDialog open={showSyncDialog} onOpenChange={setShowSyncDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sincronizar con TravelCompositor</AlertDialogTitle>
            <AlertDialogDescription>
              {initialData?.paired_flight_id ? (
                <>El vuelo fue actualizado correctamente. ¿Desea sincronizar <strong>ambos vuelos (Ida y Vuelta)</strong> con TravelCompositor?</>
              ) : (
                <>El vuelo fue actualizado correctamente. ¿Desea sincronizar los cambios con TravelCompositor?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleSkipSync} disabled={syncing}>
              No, solo guardar localmente
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSyncToTC} disabled={syncing}>
              {syncing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {initialData?.paired_flight_id ? 'Sí, sincronizar ambos' : 'Sí, sincronizar con TC'}
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
