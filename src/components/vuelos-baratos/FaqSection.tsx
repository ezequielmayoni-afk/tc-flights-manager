export interface FaqItem {
  q: string
  a: string
}

/** Preguntas frecuentes del destino: las fijas de la ficha más las calculadas. */
export function FaqSection({ items, title }: { items: FaqItem[]; title: string }) {
  if (items.length === 0) return null

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-[#1A237E]">{title}</h2>
      <dl className="mt-4 divide-y divide-[#E3E3E3] border-y border-[#E3E3E3]">
        {items.map(item => (
          <div key={item.q} className="py-4">
            <dt className="text-sm font-semibold text-[#393939]">{item.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-[#495057]">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
