import Link from 'next/link'
import { freshnessLabel } from '@/lib/vuelos-baratos/aggregates'
import { DEFAULT_ORIGIN } from '@/lib/vuelos-baratos/config'
import type { DestinationSummary } from '@/lib/vuelos-baratos/types'
import { CARD, formatUsd } from './ui'

/** Tarjeta de la grilla de la home: un destino con su precio más bajo vigente. */
export function DestinationCard({
  summary,
  originName,
  now,
}: {
  summary: DestinationSummary
  originName: string
  now: Date
}) {
  const href =
    summary.originCode === DEFAULT_ORIGIN
      ? `/vuelos-baratos/${summary.slug}`
      : `/vuelos-baratos/${summary.slug}?from=${summary.originCode}`

  return (
    <Link href={href} className={`${CARD} block px-4 py-4 transition hover:border-[#1A237E]`}>
      <p className="text-base font-semibold text-[#1A237E]">{summary.name}</p>
      <p className="mt-2 text-xs uppercase tracking-wide text-[#6C757D]">desde</p>
      <p className="text-2xl font-bold tabular-nums text-[#1A237E]">
        {summary.minPrice === null ? '—' : formatUsd(summary.minPrice)}
      </p>
      <p className="mt-1 text-xs text-[#495057]">ida y vuelta desde {originName}</p>
      {summary.observedAt ? (
        <p className="mt-2 text-xs text-[#6C757D]">actualizado {freshnessLabel(summary.observedAt, now)}</p>
      ) : null}
    </Link>
  )
}
