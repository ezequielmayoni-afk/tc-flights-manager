'use client'

import * as React from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { normalize } from '@/lib/vuelos-baratos/text'
import { INPUT } from './ui'

/**
 * Combobox de ciudades con autocomplete contra `/api/vuelos-baratos/cities`.
 *
 * El dataset de Travel Compositor son 2.044 filas: no puede ir al bundle del
 * navegador, así que la búsqueda es un fetch con 200 ms de debounce y `cmdk`
 * corre con `shouldFilter={false}` (el orden lo decide el servidor, que sabe
 * normalizar acentos y priorizar el prefijo del nombre).
 */

export interface CityOption {
  /** Código de DESTINO de Travel Compositor (no es el IATA del aeropuerto). */
  code: string
  name: string
  country: string
  label: string
  /** Slug de la landing si el destino está publicado. */
  landingSlug?: string | null
}

/** Igual que `MIN_QUERY_LENGTH` del server: abajo de esto la API devuelve []. */
const MIN_QUERY = 2
const DEBOUNCE_MS = 200

export interface CityComboboxProps {
  id: string
  label: string
  placeholder: string
  value: CityOption | null
  onChange: (city: CityOption) => void
  /** Ciudades que se muestran siempre arriba (las de salida de la landing). */
  pinned?: CityOption[]
  pinnedLabel?: string
  invalid?: boolean
}

export function CityCombobox({ id, label, placeholder, value, onChange, pinned = [], pinnedLabel, invalid }: CityComboboxProps) {
  const [abierto, setAbierto] = React.useState(false)
  const [query, setQuery] = React.useState('')
  const [resultados, setResultados] = React.useState<CityOption[]>([])
  const [buscando, setBuscando] = React.useState(false)

  React.useEffect(() => {
    const q = query.trim()
    const controller = new AbortController()

    // Todo el `setState` va dentro de un timer: en el cuerpo del efecto
    // dispararía un render en cascada (y el lint del proyecto lo marca).
    const timer = window.setTimeout(
      () => {
        if (q.length < MIN_QUERY) {
          setBuscando(false)
          setResultados([])
          return
        }
        setBuscando(true)
        fetch(`/api/vuelos-baratos/cities?q=${encodeURIComponent(q)}`, { signal: controller.signal })
          .then(res => (res.ok ? (res.json() as Promise<CityOption[]>) : Promise.reject(new Error(String(res.status)))))
          .then(items => {
            setResultados(Array.isArray(items) ? items : [])
            setBuscando(false)
          })
          .catch(() => {
            // Abortado o caído: se deja lo que había y se apaga el spinner.
            if (!controller.signal.aborted) {
              setResultados([])
              setBuscando(false)
            }
          })
      },
      q.length < MIN_QUERY ? 0 : DEBOUNCE_MS
    )

    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [query])

  const elegir = (city: CityOption): void => {
    onChange(city)
    setAbierto(false)
    setQuery('')
  }

  // Mismo criterio que el server: 'cordoba' tiene que encontrar Córdoba.
  const q = normalize(query)
  const fijadas = pinned.filter(c => q === '' || normalize(c.label).includes(q) || normalize(c.code) === q)
  const codigosFijados = new Set(fijadas.map(c => c.code))
  const encontradas = resultados.filter(c => !codigosFijados.has(c.code))

  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="block text-xs text-[#6C757D]">
        {label}
      </label>
      <Popover open={abierto} onOpenChange={setAbierto}>
        <PopoverTrigger
          id={id}
          aria-invalid={invalid || undefined}
          className={`${INPUT} mt-1 flex items-center justify-between gap-2 text-left ${invalid ? 'border-[#B42318]' : ''}`}
        >
          <span className={`truncate ${value ? 'text-[#393939]' : 'text-[#B2B2B2]'}`}>{value ? value.label : placeholder}</span>
          <ChevronDownIcon className="size-4 shrink-0 text-[#6C757D]" />
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[var(--radix-popover-trigger-width)] min-w-[260px] rounded-[8px] border-[#E3E3E3] p-0 shadow-none"
        >
          <Command shouldFilter={false} className="rounded-[8px]">
            <CommandInput value={query} onValueChange={setQuery} placeholder="Escribí una ciudad" />
            <CommandList>
              {fijadas.length === 0 && encontradas.length === 0 ? (
                // `CommandEmpty` de cmdk depende de su propio filtrado, que acá
                // está apagado: el mensaje se decide a mano.
                <p className="px-3 py-6 text-center text-sm text-[#6C757D]">
                  {buscando ? 'Buscando…' : q.length < MIN_QUERY ? 'Escribí al menos 2 letras.' : 'No encontramos esa ciudad.'}
                </p>
              ) : null}
              {fijadas.length > 0 ? (
                <CommandGroup heading={pinnedLabel}>
                  {fijadas.map(city => (
                    <Fila key={`pin-${city.code}`} city={city} onSelect={elegir} />
                  ))}
                </CommandGroup>
              ) : null}
              {encontradas.length > 0 ? (
                <CommandGroup heading={fijadas.length > 0 ? 'Más ciudades' : undefined}>
                  {encontradas.map(city => (
                    <Fila key={city.code} city={city} onSelect={elegir} />
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

function Fila({ city, onSelect }: { city: CityOption; onSelect: (city: CityOption) => void }) {
  return (
    <CommandItem
      value={city.code}
      onSelect={() => onSelect(city)}
      className="cursor-pointer text-sm text-[#393939] data-[selected=true]:bg-[#F8F9FA] data-[selected=true]:text-[#1A237E]"
    >
      <span className="min-w-0 flex-1 truncate">{city.label}</span>
      <span className="shrink-0 text-xs text-[#6C757D]">{city.code}</span>
    </CommandItem>
  )
}
