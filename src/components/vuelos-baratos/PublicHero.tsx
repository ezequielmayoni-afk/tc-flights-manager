import type { ReactNode } from 'react'

/** Encabezado de la home: título, bajada y el buscador (slot de la Tarea 5b). */
export function PublicHero({ title, subtitle, children }: { title: string; subtitle: string; children?: ReactNode }) {
  return (
    <section className="py-8 sm:py-10">
      <h1 className="text-2xl font-bold leading-tight text-[#1A237E] sm:text-3xl">{title}</h1>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#495057]">{subtitle}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}
