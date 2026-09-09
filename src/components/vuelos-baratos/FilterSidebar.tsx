'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { es } from 'date-fns/locale'
import { ChevronDownIcon } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { filtersWith, filtersWithout, hasActiveFilters, type FilterKey } from '@/lib/vuelos-baratos/filters'
import type { ExplorerFilters } from '@/lib/vuelos-baratos/types'
import { CARD, CHIP, CHIP_ACTIVO, CHIP_INACTIVO, INPUT, withFilters } from './ui'

/**
 * Barra de filtros del explorador de fechas.
 *
 * La fuente de verdad es la URL: cada control hace `router.replace` con los
 * filtros serializados y la página (server component) vuelve a renderizar. Acá
 * sólo hay estado de interfaz (qué sección está abierta, qué modo de fecha se
 * eligió antes de tocar el calendario), nunca una copia de los filtros.
 *
 * Se monta dos veces: la columna de escritorio y el `Sheet` de mobile, con las
 * secciones abiertas en la primera y cerradas en el segundo.
 */

/** Todo lo que se puede filtrar; el mes se maneja con la tira de chips. */
const CLAVES: FilterKey[] = [
  'stops',
  'direct',
  'stayMin',
  'stayMax',
  'departFrom',
  'departTo',
  'returnFrom',
  'returnTo',
  'departDow',
  'returnDow',
  'priceMin',
  'priceMax',
  'airlines',
]

const DIAS: Array<{ dow: number; label: string; title: string }> = [
  { dow: 1, label: 'LU', title: 'lunes' },
  { dow: 2, label: 'MA', title: 'martes' },
  { dow: 3, label: 'MI', title: 'miércoles' },
  { dow: 4, label: 'JU', title: 'jueves' },
  { dow: 5, label: 'VI', title: 'viernes' },
  { dow: 6, label: 'SA', title: 'sábado' },
  { dow: 7, label: 'DO', title: 'domingo' },
]

const ESTADIAS: Array<{ label: string; min: number; max?: number }> = [
  { label: '3–5', min: 3, max: 5 },
  { label: '6–8', min: 6, max: 8 },
  { label: '9–14', min: 9, max: 14 },
  { label: '15+', min: 15 },
]

/** Cuántas aerolíneas se ven antes del "Ver más". */
const AEROLINEAS_VISIBLES = 8

export interface FilterSidebarProps {
  filters: ExplorerFilters
  /** Topes calculados sobre TODOS los pares, sin filtrar. */
  priceLimits: { min: number; max: number } | null
  /** Aerolíneas de TODOS los pares, sin filtrar, con su precio más bajo. */
  airlines: Array<{ airline: string; code: string | null; minPrice: number; count: number }>
  /** Base de los links; puede traer `?from=` (ver `withFilters`). */
  basePath: string
}

// ── Helpers de fecha ───────────────────────────────────────────────────────────
// A mano y no con date-fns: `new Date('2026-12-02')` es UTC y en Argentina
// devuelve el día anterior. Ver `src/lib/dates.ts`.

function isoADate(iso: string): Date {
  const [año, mes, dia] = iso.split('-').map(Number)
  return new Date(año, mes - 1, dia)
}

function dateAIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/** '2026-12-02' → '02/12/2026' (los valores de la URL siguen en ISO). */
function fechaCorta(iso: string): string {
  const [año, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${año}`
}

// ── Piezas de interfaz ────────────────────────────────────────────────────────

function Seccion({
  title,
  defaultOpen,
  children,
}: {
  title: string
  defaultOpen: boolean
  children: React.ReactNode
}) {
  const [abierta, setAbierta] = React.useState(defaultOpen)

  return (
    <div className="border-b border-[#E3E3E3] last:border-b-0">
      <button
        type="button"
        onClick={() => setAbierta(a => !a)}
        aria-expanded={abierta}
        className="flex w-full items-center justify-between gap-2 py-3 text-left text-sm font-semibold text-[#1A237E]"
      >
        {title}
        <ChevronDownIcon className={`size-4 shrink-0 text-[#6C757D] transition ${abierta ? 'rotate-180' : ''}`} />
      </button>
      {abierta ? <div className="pb-4">{children}</div> : null}
    </div>
  )
}

/** Radio de verdad (no un `<input>`): el click navega, no manda un form. */
function Opcion({ checked, onSelect, children }: { checked: boolean; onSelect: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full items-center gap-2 py-1 text-left text-sm text-[#393939]"
    >
      <span
        className={`grid size-4 shrink-0 place-content-center rounded-full border ${
          checked ? 'border-[#1A237E]' : 'border-[#B2B2B2]'
        }`}
      >
        {checked ? <span className="size-2 rounded-full bg-[#1A237E]" /> : null}
      </span>
      {children}
    </button>
  )
}

function Casilla({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={onToggle}
      className="flex w-full items-center gap-2 py-1 text-left text-sm text-[#393939]"
    >
      <span
        className={`grid size-4 shrink-0 place-content-center rounded-[4px] border text-[10px] leading-none text-white ${
          checked ? 'border-[#1A237E] bg-[#1A237E]' : 'border-[#B2B2B2]'
        }`}
      >
        {checked ? '✓' : ''}
      </span>
      {children}
    </button>
  )
}

/**
 * Input numérico que aplica al perder foco o con Enter.
 *
 * `key` + `defaultValue` en vez de `useState`: cuando la URL cambia (un chip
 * rápido, "Quitar filtros") el campo se remonta con el valor nuevo y no hay
 * dos verdades sobre el mismo filtro.
 */
function CampoNumero({
  label,
  value,
  placeholder,
  onApply,
}: {
  label: string
  value: number | undefined
  placeholder?: string
  onApply: (value: number | undefined) => void
}) {
  const aplicar = (input: HTMLInputElement): void => {
    const texto = input.value.trim()
    if (texto === '') {
      onApply(undefined)
      return
    }
    const n = Number(texto)
    if (!Number.isFinite(n) || n < 0) {
      // Un valor imposible se descarta, pero hay que devolver el campo a lo
      // que dice la URL: si no, queda mostrando un número que no se aplicó
      // (la URL no cambia, así que el remonte por `key` tampoco pasa).
      input.value = String(value ?? '')
      return
    }
    onApply(Math.round(n))
  }

  return (
    <label className="flex-1 text-xs text-[#6C757D]">
      {label}
      <input
        key={String(value ?? '')}
        type="number"
        inputMode="numeric"
        min={0}
        defaultValue={value ?? ''}
        placeholder={placeholder}
        onBlur={e => aplicar(e.currentTarget)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault()
            e.currentTarget.blur()
          }
        }}
        className={`${INPUT} mt-1`}
      />
    </label>
  )
}

type ModoFecha = 'cualquiera' | 'rango' | 'dow'

function SeccionFecha({
  title,
  defaultOpen,
  from,
  to,
  dow,
  onRango,
  onDow,
  onLimpiar,
}: {
  title: string
  defaultOpen: boolean
  from: string | undefined
  to: string | undefined
  dow: number[] | undefined
  onRango: (from: string | undefined, to: string | undefined) => void
  onDow: (dow: number[] | undefined) => void
  onLimpiar: () => void
}) {
  const modoUrl: ModoFecha = dow?.length ? 'dow' : from || to ? 'rango' : 'cualquiera'
  // Elegir "Rango de fechas" tiene que mostrar el calendario antes de que haya
  // fecha en la URL, así que el modo se recuerda mientras la URL esté vacía.
  const [modoElegido, setModoElegido] = React.useState<ModoFecha>(modoUrl)
  const modo = modoUrl === 'cualquiera' ? modoElegido : modoUrl

  const cambiar = (nuevo: ModoFecha): void => {
    setModoElegido(nuevo)
    // Cambiar de modo tira lo del modo anterior: no se filtra por rango y por
    // día de la semana a la vez sin que se vea.
    if (nuevo !== modoUrl) onLimpiar()
  }

  const seleccion = from || to ? { from: from ? isoADate(from) : undefined, to: to ? isoADate(to) : undefined } : undefined
  const etiqueta = from && to ? `${fechaCorta(from)} – ${fechaCorta(to)}` : from ? `desde ${fechaCorta(from)}` : to ? `hasta ${fechaCorta(to)}` : 'Elegir fechas'

  return (
    <Seccion title={title} defaultOpen={defaultOpen}>
      <div role="radiogroup" aria-label={title}>
        <Opcion checked={modo === 'cualquiera'} onSelect={() => cambiar('cualquiera')}>
          Cualquier momento
        </Opcion>
        <Opcion checked={modo === 'rango'} onSelect={() => cambiar('rango')}>
          Rango de fechas
        </Opcion>
        <Opcion checked={modo === 'dow'} onSelect={() => cambiar('dow')}>
          Día de la semana
        </Opcion>
      </div>

      {modo === 'rango' ? (
        <Popover>
          <PopoverTrigger className={`${INPUT} mt-2 flex items-center justify-between text-left`}>
            <span className={from || to ? 'text-[#393939]' : 'text-[#B2B2B2]'}>{etiqueta}</span>
            <ChevronDownIcon className="size-4 shrink-0 text-[#6C757D]" />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto rounded-[8px] border-[#E3E3E3] p-0 shadow-none">
            <Calendar
              mode="range"
              locale={es}
              selected={seleccion}
              defaultMonth={from ? isoADate(from) : undefined}
              onSelect={rango => {
                // react-day-picker v9 devuelve `{ from: d, to: d }` con el
                // primer click. Tomarlo literal filtraría un solo día y casi
                // siempre dejaría la tabla vacía; se guarda como "desde d" y
                // el segundo click cierra el rango.
                const desde = rango?.from
                const hasta = desde && rango?.to && rango.to > desde ? rango.to : undefined
                onRango(desde ? dateAIso(desde) : undefined, hasta ? dateAIso(hasta) : undefined)
              }}
              classNames={{
                // El turquesa está reservado para la acción principal.
                range_start: 'rounded-l-md bg-[#F1F3F5]',
                range_end: 'rounded-r-md bg-[#F1F3F5]',
                range_middle: 'rounded-none bg-[#F1F3F5]',
                today: 'rounded-md font-semibold text-[#1A237E] data-[selected=true]:rounded-none',
              }}
            />
            {from || to ? (
              <button
                type="button"
                onClick={() => onRango(undefined, undefined)}
                className="block w-full border-t border-[#E3E3E3] px-3 py-2 text-left text-xs font-semibold text-[#1A237E]"
              >
                Quitar las fechas
              </button>
            ) : null}
          </PopoverContent>
        </Popover>
      ) : null}

      {modo === 'dow' ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {DIAS.map(dia => {
            const activo = Boolean(dow?.includes(dia.dow))
            return (
              <button
                key={dia.dow}
                type="button"
                aria-pressed={activo}
                title={dia.title}
                onClick={() => {
                  const actuales = dow ?? []
                  const nuevos = activo ? actuales.filter(d => d !== dia.dow) : [...actuales, dia.dow].sort((a, b) => a - b)
                  onDow(nuevos.length > 0 ? nuevos : undefined)
                }}
                className={`${CHIP} ${activo ? CHIP_ACTIVO : CHIP_INACTIVO}`}
              >
                {dia.label}
              </button>
            )
          })}
        </div>
      ) : null}
    </Seccion>
  )
}

// ── El panel ──────────────────────────────────────────────────────────────────

// El panel no arma URLs: recibe los dos callbacks ya atados al `basePath`.
interface PanelProps extends Omit<FilterSidebarProps, 'basePath'> {
  /** En escritorio las secciones arrancan abiertas; en el `Sheet`, cerradas. */
  abiertas: boolean
  aplicar: (patch: Partial<ExplorerFilters>) => void
  quitar: (...keys: FilterKey[]) => void
  /** Saca los 13 filtros de una (conserva el mes y el orden). */
  limpiar: () => void
}

function FilterPanel({ filters, priceLimits, airlines, abiertas, aplicar, quitar, limpiar }: PanelProps) {
  const [verTodas, setVerTodas] = React.useState(false)
  const elegidas = filters.airlines ?? []
  const visibles = verTodas ? airlines : airlines.slice(0, AEROLINEAS_VISIBLES)
  // `stops=0` puede venir de una URL escrita a mano: para el visitante también
  // es "solo directos" (el radio lo aplica como `direct=1`, que además exige
  // que la vuelta sea directa).
  const escalas: 'todas' | 'directo' | '1' | '2' =
    filters.direct || filters.stops === 0
      ? 'directo'
      : filters.stops === 1
        ? '1'
        : filters.stops === 2
          ? '2'
          : 'todas'

  return (
    <div className="px-4">
      <Seccion title="Escalas" defaultOpen={abiertas}>
        <div role="radiogroup" aria-label="Escalas">
          <Opcion checked={escalas === 'todas'} onSelect={() => quitar('direct', 'stops')}>
            Todas
          </Opcion>
          <Opcion checked={escalas === 'directo'} onSelect={() => aplicar({ direct: true, stops: undefined })}>
            Solo directos
          </Opcion>
          <Opcion checked={escalas === '1'} onSelect={() => aplicar({ stops: 1, direct: undefined })}>
            1 escala
          </Opcion>
          <Opcion checked={escalas === '2'} onSelect={() => aplicar({ stops: 2, direct: undefined })}>
            2 o más
          </Opcion>
        </div>
      </Seccion>

      <Seccion title="Estadía" defaultOpen={abiertas}>
        <div className="flex gap-2">
          <CampoNumero label="Mín. noches" value={filters.stayMin} onApply={v => aplicar({ stayMin: v })} />
          <CampoNumero label="Máx. noches" value={filters.stayMax} onApply={v => aplicar({ stayMax: v })} />
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {ESTADIAS.map(rango => {
            const activo = filters.stayMin === rango.min && filters.stayMax === rango.max
            return (
              <button
                key={rango.label}
                type="button"
                aria-pressed={activo}
                onClick={() => (activo ? quitar('stayMin', 'stayMax') : aplicar({ stayMin: rango.min, stayMax: rango.max }))}
                className={`${CHIP} ${activo ? CHIP_ACTIVO : CHIP_INACTIVO}`}
              >
                {rango.label}
              </button>
            )
          })}
        </div>
      </Seccion>

      <SeccionFecha
        title="Fecha de ida"
        defaultOpen={abiertas}
        from={filters.departFrom}
        to={filters.departTo}
        dow={filters.departDow}
        onRango={(from, to) => aplicar({ departFrom: from, departTo: to, departDow: undefined })}
        onDow={dow => aplicar({ departDow: dow, departFrom: undefined, departTo: undefined })}
        onLimpiar={() => quitar('departFrom', 'departTo', 'departDow')}
      />

      <SeccionFecha
        title="Fecha de vuelta"
        defaultOpen={abiertas}
        from={filters.returnFrom}
        to={filters.returnTo}
        dow={filters.returnDow}
        onRango={(from, to) => aplicar({ returnFrom: from, returnTo: to, returnDow: undefined })}
        onDow={dow => aplicar({ returnDow: dow, returnFrom: undefined, returnTo: undefined })}
        onLimpiar={() => quitar('returnFrom', 'returnTo', 'returnDow')}
      />

      <Seccion title="Precio" defaultOpen={abiertas}>
        <div className="flex gap-2">
          <CampoNumero
            label="Desde US$"
            value={filters.priceMin}
            placeholder={priceLimits ? String(Math.round(priceLimits.min)) : undefined}
            onApply={v => aplicar({ priceMin: v })}
          />
          <CampoNumero
            label="Hasta US$"
            value={filters.priceMax}
            placeholder={priceLimits ? String(Math.round(priceLimits.max)) : undefined}
            onApply={v => aplicar({ priceMax: v })}
          />
        </div>
      </Seccion>

      {airlines.length > 0 ? (
        <Seccion title="Aerolíneas" defaultOpen={abiertas}>
          {visibles.map(a => {
            const activa = elegidas.includes(a.airline)
            return (
              <Casilla
                key={a.airline}
                checked={activa}
                onToggle={() => {
                  const nuevas = activa ? elegidas.filter(v => v !== a.airline) : [...elegidas, a.airline]
                  aplicar({ airlines: nuevas.length > 0 ? nuevas : undefined })
                }}
              >
                <span className="min-w-0 flex-1 truncate" title={a.airline}>
                  {a.airline}
                </span>
                <span className="shrink-0 tabular-nums text-xs text-[#6C757D]">desde US$ {Math.round(a.minPrice)}</span>
              </Casilla>
            )
          })}
          {airlines.length > AEROLINEAS_VISIBLES ? (
            <button
              type="button"
              onClick={() => setVerTodas(v => !v)}
              className="mt-2 text-xs font-semibold text-[#1A237E] underline"
            >
              {verTodas ? 'Ver menos' : `Ver más (${airlines.length - AEROLINEAS_VISIBLES})`}
            </button>
          ) : null}
        </Seccion>
      ) : null}

      {hasActiveFilters(filters) ? (
        <div className="py-4">
          <button
            type="button"
            onClick={limpiar}
            className="w-full rounded-[8px] border border-[#1A237E] px-4 py-2 text-sm font-semibold text-[#1A237E] transition hover:bg-[#F8F9FA]"
          >
            Quitar filtros
          </button>
        </div>
      ) : null}
    </div>
  )
}

// ── El componente ─────────────────────────────────────────────────────────────

/** Cuántos grupos de filtros están puestos, para el botón de mobile. */
function contarActivos(f: ExplorerFilters): number {
  const grupos = [
    f.direct || f.stops !== undefined,
    f.stayMin !== undefined || f.stayMax !== undefined,
    Boolean(f.departFrom || f.departTo || f.departDow?.length),
    Boolean(f.returnFrom || f.returnTo || f.returnDow?.length),
    f.priceMin !== undefined || f.priceMax !== undefined,
    Boolean(f.airlines?.length),
  ]
  return grupos.filter(Boolean).length
}

export function FilterSidebar({ filters, priceLimits, airlines, basePath }: FilterSidebarProps) {
  const router = useRouter()
  const [aplicando, startTransition] = React.useTransition()
  const [abierto, setAbierto] = React.useState(false)

  const navegar = React.useCallback(
    (siguientes: ExplorerFilters) => {
      startTransition(() => router.replace(withFilters(basePath, siguientes), { scroll: false }))
    },
    [basePath, router]
  )

  const aplicar = React.useCallback(
    (patch: Partial<ExplorerFilters>) => navegar(filtersWith(filters, patch)),
    [filters, navegar]
  )
  const quitar = React.useCallback(
    (...keys: FilterKey[]) => navegar(filtersWithout(filters, ...keys)),
    [filters, navegar]
  )

  const activos = contarActivos(filters)
  // "Quitar filtros" conserva el mes y el orden elegidos: sólo saca los filtros.
  const limpiarTodo = (): void => {
    setAbierto(false)
    quitar(...CLAVES)
  }

  const encabezado = (
    <div className="flex items-center justify-between gap-2 px-4 py-3">
      <p className="text-sm font-semibold text-[#1A237E]">Filtros</p>
      {hasActiveFilters(filters) ? (
        <button type="button" onClick={limpiarTodo} className="text-xs font-semibold text-[#1A237E] underline">
          Quitar filtros
        </button>
      ) : null}
    </div>
  )

  const panel = (abiertas: boolean) => (
    <FilterPanel
      filters={filters}
      priceLimits={priceLimits}
      airlines={airlines}
      abiertas={abiertas}
      aplicar={aplicar}
      quitar={quitar}
      limpiar={limpiarTodo}
    />
  )

  return (
    <>
      {/* Mobile: un botón arriba de la tabla que abre el cajón. */}
      <div className="lg:hidden">
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger
            className={`${CARD} flex w-full items-center justify-between px-4 py-3 text-sm font-semibold text-[#1A237E]`}
          >
            Filtros{activos > 0 ? ` (${activos})` : ''}
            <ChevronDownIcon className="size-4 shrink-0 -rotate-90 text-[#6C757D]" />
          </SheetTrigger>
          <SheetContent
            side="left"
            // El cajón ya se explica con su título; sin esto Radix avisa por
            // consola que falta `aria-describedby`.
            aria-describedby={undefined}
            aria-busy={aplicando}
            className="w-[88%] max-w-[340px] gap-0 overflow-y-auto border-[#E3E3E3] bg-white p-0 text-[#393939] shadow-none"
          >
            <SheetTitle className="sr-only">Filtros</SheetTitle>
            {encabezado}
            <div className="border-t border-[#E3E3E3]">{panel(false)}</div>
            <div className="sticky bottom-0 border-t border-[#E3E3E3] bg-white px-4 py-3">
              <button
                type="button"
                onClick={() => setAbierto(false)}
                className="w-full rounded-[8px] border border-[#1A237E] px-4 py-2 text-sm font-semibold text-[#1A237E]"
              >
                Ver resultados
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Escritorio: la columna de 280 px, con las secciones abiertas. */}
      <aside
        aria-busy={aplicando}
        className={`${CARD} hidden lg:block ${aplicando ? 'opacity-60 transition-opacity' : ''}`}
      >
        {encabezado}
        <div className="border-t border-[#E3E3E3]">{panel(true)}</div>
      </aside>
    </>
  )
}
