import { getEvents } from '@/lib/data'
import { EventsExplorer } from '@/components/EventsExplorer'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
  const events = await getEvents()

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="-mx-4 -mt-8 bg-brand-gradient px-4 py-14 text-white sm:rounded-b-3xl">
        <div className="mx-auto max-w-6xl">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-accent">
            Fórmula 1 · Entradas oficiales
          </p>
          <h1 className="max-w-2xl text-balance text-4xl font-black leading-tight sm:text-5xl">
            Viví la Fórmula 1 en vivo
          </h1>
          <p className="mt-4 max-w-xl text-white/80">
            Elegí tu Gran Premio, tu sector y tu vista desde el asiento. Entradas
            oficiales, precios actualizados a diario y compra 100% segura.
          </p>
        </div>
      </section>

      {/* Listado + filtros */}
      <section>
        {events.length === 0 ? (
          <div className="rounded-[var(--radius-card)] bg-surface p-10 text-center text-muted ring-1 ring-black/5">
            No hay Grandes Premios disponibles en este momento. Volvé pronto.
          </div>
        ) : (
          <EventsExplorer events={events} />
        )}
      </section>
    </div>
  )
}
