import type { ReactNode } from 'react'

/**
 * Encabezado de la home: título, intro, bajada y el buscador.
 *
 * `intro` es el párrafo que lee Google debajo del H1 (pasajes, ofertas de
 * vuelos, ida y vuelta); `subtitle` es la letra chica de siempre sobre de dónde
 * salen los precios.
 */
export function PublicHero({
  title,
  subtitle,
  intro,
  children,
}: {
  title: string
  subtitle: string
  intro?: string
  children?: ReactNode
}) {
  return (
    <section className="py-8 sm:py-10">
      <h1 className="text-2xl font-bold leading-tight text-[#1A237E] sm:text-3xl">{title}</h1>
      {intro ? <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#393939]">{intro}</p> : null}
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#495057]">{subtitle}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  )
}
