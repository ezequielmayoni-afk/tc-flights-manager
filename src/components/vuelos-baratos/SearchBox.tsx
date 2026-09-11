'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { es } from 'date-fns/locale'
import { ChevronDownIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { DEFAULT_ORIGIN, ORIGINS } from '@/lib/vuelos-baratos/config'
import { buildSiviajoFlightUrl, withUtm } from '@/lib/vuelos-baratos/deep-link'
import { track } from '@/lib/vuelos-baratos/track-client'
import type { LandingDestinationRow } from '@/lib/vuelos-baratos/types'
import { CityCombobox, type CityOption } from './CityCombobox'
import { BOTON_PRIMARIO, CARD, INPUT, ROJO_ERROR } from './ui'

/**
 * El buscador de la landing.
 *
 * Tiene dos salidas: si el destino elegido tiene landing propia y el visitante
 * dejó marcado "Ver fechas más baratas", va al explorador de fechas (interno,
 * sin fechas); si no, abre la búsqueda en vivo de siviajo.com en otra pestaña.
 * La búsqueda real nunca pasa acá: la landing sólo muestra observaciones.
 */

/** El turquesa está reservado para la acción principal, no para el calendario. */
const CALENDARIO = {
  range_start: 'rounded-l-md bg-[#F1F3F5]',
  range_end: 'rounded-r-md bg-[#F1F3F5]',
  range_middle: 'rounded-none bg-[#F1F3F5]',
  today: 'rounded-md font-semibold text-[#1A237E] data-[selected=true]:rounded-none',
}

const MAX_ADULTOS = 9
const MAX_MENORES = 6
const MAX_EDAD = 17

interface Fechas {
  from?: Date
  to?: Date
}

interface Errores {
  destino?: string
  fechas?: string
}

// Mismos helpers que `FilterSidebar`: `new Date('2026-12-02')` es UTC y en
// Argentina cae un día antes.
function dateAIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function fechaCorta(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`
}

/** Lo más temprano que se puede volar: mañana. */
function manana(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  return d
}

const ORIGENES: CityOption[] = ORIGINS.map(o => ({ code: o.code, name: o.name, country: 'Argentina', label: o.name }))

function origenPorCodigo(code: string): CityOption {
  return ORIGENES.find(o => o.code === code) ?? ORIGENES[0]
}

function destinoDePagina(destination: LandingDestinationRow | undefined): CityOption | null {
  if (!destination) return null
  return {
    code: destination.tc_code,
    name: destination.name,
    country: '',
    label: destination.name,
    landingSlug: destination.slug,
  }
}

function MensajeError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="mt-1 text-xs" style={{ color: ROJO_ERROR }}>
      {children}
    </p>
  )
}

function Contador({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  const boton = 'grid size-7 place-content-center rounded-[4px] border border-[#E3E3E3] text-sm font-semibold text-[#1A237E] disabled:text-[#B2B2B2]'
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="text-sm text-[#393939]">{label}</span>
      <span className="flex items-center gap-2">
        <button type="button" className={boton} disabled={value <= min} aria-label={`Menos ${label}`} onClick={() => onChange(value - 1)}>
          −
        </button>
        <span className="w-5 text-center text-sm tabular-nums text-[#393939]">{value}</span>
        <button type="button" className={boton} disabled={value >= max} aria-label={`Más ${label}`} onClick={() => onChange(value + 1)}>
          +
        </button>
      </span>
    </div>
  )
}

export interface SearchBoxProps {
  /** Código TC de la ciudad de salida elegida en la página. */
  originCode: string
  /** Sólo cuando la página ya sabe el destino (página de destino). */
  destination?: LandingDestinationRow
  /**
   * Base del motor de reservas. La manda el server component: `SIVIAJO_BASE_URL`
   * no tiene prefijo `NEXT_PUBLIC_` y en el navegador no existe.
   */
  siviajoBase?: string
}

export function SearchBox({ originCode, destination, siviajoBase }: SearchBoxProps) {
  const router = useRouter()
  const [origen, setOrigen] = React.useState<CityOption>(() => origenPorCodigo(originCode))
  const [destino, setDestino] = React.useState<CityOption | null>(() => destinoDePagina(destination))
  const [soloIda, setSoloIda] = React.useState(false)
  const [fechas, setFechas] = React.useState<Fechas>({})
  const [adultos, setAdultos] = React.useState(1)
  const [edades, setEdades] = React.useState<number[]>([])
  const [verBaratas, setVerBaratas] = React.useState(Boolean(destination))
  const [errores, setErrores] = React.useState<Errores>({})
  const [abreFechas, setAbreFechas] = React.useState(false)

  const minDate = React.useMemo(() => manana(), [])
  // El explorador sólo tiene observaciones de las ciudades de `ORIGINS`: con
  // cualquier otro origen se va a buscar a siviajo.com aunque el destino tenga
  // landing, para no mostrar precios de Buenos Aires a alguien que sale de Lima.
  const origenConDatos = ORIGENES.some(o => o.code === origen.code)
  const alLanding = verBaratas && origenConDatos && Boolean(destino?.landingSlug)

  const elegirDestino = (city: CityOption): void => {
    setDestino(city)
    // El default del check sigue al destino: si tiene landing, conviene.
    setVerBaratas(Boolean(city.landingSlug))
    setErrores(e => ({ ...e, destino: undefined }))
  }

  const etiquetaFechas = fechas.from
    ? soloIda || !fechas.to
      ? fechaCorta(fechas.from)
      : `${fechaCorta(fechas.from)} – ${fechaCorta(fechas.to)}`
    : 'Elegir fechas'

  const etiquetaPasajeros = `${adultos} ${adultos === 1 ? 'adulto' : 'adultos'}${
    edades.length > 0 ? `, ${edades.length} ${edades.length === 1 ? 'menor' : 'menores'}` : ''
  }`

  const enviar = (event: React.FormEvent): void => {
    event.preventDefault()
    const nuevos: Errores = {}
    if (!destino) nuevos.destino = 'Elegí un destino.'

    // Con "Ver fechas más baratas" el explorador es justamente para el que no
    // tiene fechas: sólo se piden cuando se va a buscar a siviajo.com.
    if (!alLanding) {
      if (!fechas.from) nuevos.fechas = 'Elegí la fecha de ida.'
      else if (!soloIda && !fechas.to) nuevos.fechas = 'Elegí la fecha de vuelta.'
      else if (!soloIda && fechas.to && dateAIso(fechas.to) <= dateAIso(fechas.from))
        nuevos.fechas = 'La vuelta tiene que ser posterior a la ida.'
    }

    setErrores(nuevos)
    if (Object.keys(nuevos).length > 0 || !destino) return

    if (alLanding && destino.landingSlug) {
      // Sin `?from=` cuando sale de la ciudad por defecto: es la URL canónica
      // del destino (mismo criterio que `DestinationCard`).
      const desde = origen.code === DEFAULT_ORIGIN ? '' : `?from=${origen.code}`
      router.push(`/vuelos-baratos/${destino.landingSlug}${desde}`)
      return
    }

    const depart = dateAIso(fechas.from as Date)
    const returnDate = soloIda || !fechas.to ? null : dateAIso(fechas.to)
    let url: string
    try {
      url = buildSiviajoFlightUrl({
        originCode: origen.code,
        destCode: destino.code,
        departDate: depart,
        returnDate,
        adults: adultos,
        childrenAges: edades,
        baseUrl: siviajoBase,
      })
    } catch {
      setErrores({ fechas: 'Revisá las fechas elegidas.' })
      return
    }

    // El evento va ANTES del `window.open`: si el navegador bloquea la
    // pestaña nueva (o la apertura descarga esta página), la búsqueda ya
    // quedó contada.
    track('search_submit', {
      origin: origen.code,
      destination: destino.code,
      depart,
      return: returnDate,
      adults: adultos,
      children: edades.length,
    })
    window.open(withUtm(url, { campaign: 'buscador', content: `${origen.code}-${destino.code}` }), '_blank', 'noopener')
  }

  return (
    <form onSubmit={enviar} className={`${CARD} px-4 py-4`} noValidate>
      <div className="flex flex-col gap-3 sm:flex-row">
        <CityCombobox
          id="vb-origen"
          label="Origen"
          placeholder="¿Desde dónde salís?"
          value={origen}
          onChange={setOrigen}
          pinned={ORIGENES}
          pinnedLabel="Ciudades de salida"
        />
        <div className="min-w-0 flex-1">
          <CityCombobox
            id="vb-destino"
            label="Destino"
            placeholder="¿A dónde vas?"
            value={destino}
            onChange={elegirDestino}
            invalid={Boolean(errores.destino)}
          />
          {errores.destino ? <MensajeError>{errores.destino}</MensajeError> : null}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex shrink-0 rounded-[8px] border border-[#E3E3E3] p-0.5 text-xs font-semibold">
          {[
            { label: 'Ida y vuelta', valor: false },
            { label: 'Solo ida', valor: true },
          ].map(opcion => (
            <button
              key={opcion.label}
              type="button"
              aria-pressed={soloIda === opcion.valor}
              onClick={() => {
                setSoloIda(opcion.valor)
                if (opcion.valor) setFechas(f => ({ from: f.from }))
              }}
              className={`rounded-[6px] px-3 py-1.5 transition ${
                soloIda === opcion.valor ? 'bg-[#1A237E] text-white' : 'text-[#495057]'
              }`}
            >
              {opcion.label}
            </button>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          <Popover open={abreFechas} onOpenChange={setAbreFechas}>
            <PopoverTrigger
              aria-invalid={Boolean(errores.fechas) || undefined}
              className={`${INPUT} flex items-center justify-between gap-2 text-left ${errores.fechas ? 'border-[#B42318]' : ''}`}
            >
              <span className={fechas.from ? 'text-[#393939]' : 'text-[#B2B2B2]'}>{etiquetaFechas}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-[#6C757D]" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto rounded-[8px] border-[#E3E3E3] p-0 shadow-none">
              {soloIda ? (
                <Calendar
                  mode="single"
                  locale={es}
                  selected={fechas.from}
                  defaultMonth={fechas.from ?? minDate}
                  disabled={{ before: minDate }}
                  classNames={CALENDARIO}
                  onSelect={date => {
                    setFechas({ from: date })
                    setErrores(e => ({ ...e, fechas: undefined }))
                    if (date) setAbreFechas(false)
                  }}
                />
              ) : (
                <Calendar
                  mode="range"
                  locale={es}
                  selected={fechas.from || fechas.to ? { from: fechas.from, to: fechas.to } : undefined}
                  defaultMonth={fechas.from ?? minDate}
                  disabled={{ before: minDate }}
                  classNames={CALENDARIO}
                  onSelect={rango => {
                    // react-day-picker v9 devuelve `{ from: d, to: d }` con el
                    // primer click (un rango de un día). Si no se descartara,
                    // el calendario se cerraría con ida = vuelta y la
                    // validación pediría después una vuelta posterior.
                    const from = rango?.from
                    const to = from && rango?.to && rango.to > from ? rango.to : undefined
                    setFechas({ from, to })
                    setErrores(e => ({ ...e, fechas: undefined }))
                    if (from && to) setAbreFechas(false)
                  }}
                />
              )}
            </PopoverContent>
          </Popover>
          {errores.fechas ? <MensajeError>{errores.fechas}</MensajeError> : null}
        </div>

        <div className="min-w-0 sm:w-[190px]">
          <Popover>
            <PopoverTrigger className={`${INPUT} flex items-center justify-between gap-2 text-left`}>
              <span className="truncate text-[#393939]">{etiquetaPasajeros}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-[#6C757D]" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[260px] rounded-[8px] border-[#E3E3E3] shadow-none">
              <Contador label="Adultos" value={adultos} min={1} max={MAX_ADULTOS} onChange={setAdultos} />
              <Contador
                label="Menores"
                value={edades.length}
                min={0}
                max={MAX_MENORES}
                onChange={cantidad =>
                  setEdades(actuales =>
                    cantidad > actuales.length ? [...actuales, ...Array(cantidad - actuales.length).fill(8)] : actuales.slice(0, cantidad)
                  )
                }
              />
              {edades.length > 0 ? (
                <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[#E3E3E3] pt-2">
                  {edades.map((edad, i) => (
                    <label key={i} className="text-[10px] text-[#6C757D]">
                      Menor {i + 1}
                      <select
                        value={edad}
                        aria-label={`Edad del menor ${i + 1}`}
                        onChange={e => {
                          const valor = Number(e.currentTarget.value)
                          setEdades(actuales => actuales.map((v, j) => (j === i ? valor : v)))
                        }}
                        className={`${INPUT} mt-0.5 px-1 text-xs`}
                      >
                        {Array.from({ length: MAX_EDAD + 1 }, (_, edadOpcion) => (
                          <option key={edadOpcion} value={edadOpcion}>
                            {edadOpcion}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex items-center gap-2 text-sm text-[#495057]">
          <input
            type="checkbox"
            checked={verBaratas}
            onChange={e => setVerBaratas(e.currentTarget.checked)}
            className="size-4 accent-[#1A237E]"
          />
          Ver fechas más baratas
        </label>
        <button type="submit" className={`${BOTON_PRIMARIO} w-full sm:w-auto`}>
          Buscar vuelos
        </button>
      </div>

      {alLanding ? (
        <p className="mt-2 text-xs text-[#6C757D]">
          Te llevamos al calendario de precios de {destino?.name}: no hace falta que elijas fechas.
        </p>
      ) : null}
    </form>
  )
}
