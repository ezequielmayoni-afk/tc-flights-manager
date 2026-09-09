/** Datos estructurados de schema.org. El JSON lo arma la página. */
export function JsonLd({ data }: { data: unknown }) {
  // Un '<' sin escapar (un '</script>' dentro de un nombre o una URL) cerraría
  // la etiqueta antes de tiempo; '\u003c' es JSON válido y no la corta.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
