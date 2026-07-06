'use client'

import { useMemo, useState } from 'react'
import type { F1Event } from '@/lib/types'
import { countryName } from '@/lib/format'
import { EventCard } from './EventCard'

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function monthOf(ev: F1Event): number | null {
  if (!ev.date_time) return null
  return new Date(ev.date_time).getUTCMonth()
}

function FilterGroup({
  title,
  options,
  selected,
  onToggle,
}: {
  title: string
  options: { value: string; label: string; count: number }[]
  selected: Set<string>
  onToggle: (v: string) => void
}) {
  if (options.length === 0) return null
  return (
    <div className="border-b border-black/5 py-4">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="space-y-1.5">
        {options.map((o) => (
          <li key={o.value}>
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selected.has(o.value)}
                onChange={() => onToggle(o.value)}
                className="h-4 w-4 accent-[var(--color-brand)]"
              />
              <span className="flex-1">{o.label}</span>
              <span className="text-xs text-muted">{o.count}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function EventsExplorer({ events }: { events: F1Event[] }) {
  const [countries, setCountries] = useState<Set<string>>(new Set())
  const [months, setMonths] = useState<Set<string>>(new Set())

  const countryOpts = useMemo(() => {
    const map = new Map<string, number>()
    for (const e of events) {
      const c = e.country_code || ''
      if (!c) continue
      map.set(c, (map.get(c) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .map(([value, count]) => ({ value, label: countryName(value), count }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [events])

  const monthOpts = useMemo(() => {
    const map = new Map<number, number>()
    for (const e of events) {
      const m = monthOf(e)
      if (m == null) continue
      map.set(m, (map.get(m) ?? 0) + 1)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([m, count]) => ({ value: String(m), label: MONTHS[m], count }))
  }, [events])

  const toggle = (set: Set<string>, setter: (s: Set<string>) => void, v: string) => {
    const next = new Set(set)
    next.has(v) ? next.delete(v) : next.add(v)
    setter(next)
  }

  const filtered = useMemo(() => {
    return events.filter((e) => {
      if (countries.size && !countries.has(e.country_code || '')) return false
      if (months.size) {
        const m = monthOf(e)
        if (m == null || !months.has(String(m))) return false
      }
      return true
    })
  }, [events, countries, months])

  const hasFilters = countries.size > 0 || months.size > 0

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      {/* Sidebar de filtros */}
      <aside className="h-fit rounded-[var(--radius-card)] bg-surface p-4 ring-1 ring-black/5 lg:sticky lg:top-20">
        <div className="flex items-center justify-between">
          <h2 className="font-bold">Filtros</h2>
          {hasFilters && (
            <button
              onClick={() => { setCountries(new Set()); setMonths(new Set()) }}
              className="text-xs text-brand hover:underline"
            >
              Limpiar
            </button>
          )}
        </div>
        <FilterGroup title="País" options={countryOpts} selected={countries} onToggle={(v) => toggle(countries, setCountries, v)} />
        <FilterGroup title="Mes" options={monthOpts} selected={months} onToggle={(v) => toggle(months, setMonths, v)} />
      </aside>

      {/* Grilla */}
      <div>
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="text-2xl font-bold">Próximos Grandes Premios</h2>
          <span className="text-sm text-muted">
            {filtered.length} de {events.length}
          </span>
        </div>
        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-surface p-10 text-center text-muted ring-1 ring-black/5">
            No hay Grandes Premios con esos filtros.
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((ev) => (
              <EventCard key={ev.id} ev={ev} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
