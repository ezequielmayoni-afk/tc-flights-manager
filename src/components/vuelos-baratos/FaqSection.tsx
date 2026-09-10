import { normalize } from '@/lib/vuelos-baratos/text'
import { JsonLd } from './JsonLd'

export interface FaqItem {
  q: string
  a: string
}

function esValida(item: FaqItem): boolean {
  return Boolean(item) && typeof item.q === 'string' && typeof item.a === 'string' && item.q.trim() !== '' && item.a.trim() !== ''
}

/** '¿Cuánto dura el vuelo?' y '¿Cuanto dura el vuelo?' son la misma pregunta. */
function clave(pregunta: string): string {
  return normalize(pregunta).replace(/[¿?¡!.,;:]/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Una pregunta por tema, la primera que aparezca.
 *
 * Las de la ficha van antes que las calculadas: si alguien escribió a mano
 * "¿Cuánto cuesta un pasaje a Miami desde Buenos Aires?", esa respuesta gana y
 * la calculada no se repite abajo (ni en el JSON-LD, que rechaza duplicados).
 */
function sinRepetidas(items: FaqItem[]): FaqItem[] {
  const vistas = new Set<string>()
  return items.filter(item => {
    const k = clave(item.q)
    if (vistas.has(k)) return false
    vistas.add(k)
    return true
  })
}

/**
 * Preguntas frecuentes del destino: las fijas de la ficha más las calculadas.
 *
 * Las de la ficha salen de una columna JSONB, así que pueden venir con
 * cualquier forma: una fila rota se saltea en vez de romper la página.
 *
 * El `FAQPage` de schema.org sale de la MISMA lista que el HTML (y por eso vive
 * acá y no en la página): si una pregunta no se ve, tampoco se declara —
 * prometerle a Google algo que no está en la página es motivo de penalización.
 */
export function FaqSection({ items, title }: { items: FaqItem[]; title: string }) {
  const validas = sinRepetidas(items.filter(esValida))
  if (validas.length === 0) return null

  const faqPage = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: validas.map(item => ({
      '@type': 'Question',
      name: item.q.trim(),
      acceptedAnswer: { '@type': 'Answer', text: item.a.trim() },
    })),
  }

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold text-[#1A237E]">{title}</h2>
      <dl className="mt-4 divide-y divide-[#E3E3E3] border-y border-[#E3E3E3]">
        {validas.map((item, i) => (
          <div key={`${i}-${item.q}`} className="py-4">
            <dt className="text-sm font-semibold text-[#393939]">{item.q}</dt>
            <dd className="mt-1 text-sm leading-relaxed text-[#495057]">{item.a}</dd>
          </div>
        ))}
      </dl>
      <JsonLd data={faqPage} />
    </section>
  )
}
