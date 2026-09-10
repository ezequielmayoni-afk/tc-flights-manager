/**
 * Una URL de la landing tal como la ve Google, ya masticada por el server:
 * los números vienen formateados y la frescura del rastreo también, para que
 * el cliente no haga ICU ni cuentas con fechas (y no haya desajuste de
 * hidratación).
 */
export interface GscUrlRow {
  url: string
  /** Lo que se muestra: `/vuelos-baratos` o el slug del destino. */
  path: string
  /** 'Indexada', 'Sin indexar', 'Excluida'… */
  verdict: string
  tone: 'ok' | 'warn' | 'muted'
  /** `coverageState` de Google (texto libre, localizado). */
  coverage: string | null
  /** 'hace 6 h' o '—' si Google nunca la rastreó. */
  crawled: string
  clicks: string
  impressions: string
  position: string
}

const TONOS: Record<GscUrlRow['tone'], string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  muted: 'text-gray-500',
}

/**
 * Indexación por URL: qué páginas de la landing están en el índice y cuánto
 * tráfico traen. Sólo lectura — lo que se toca (publicar un destino, barrer
 * una ruta) vive en la tabla de destinos.
 */
export function GscUrlTable({ rows }: { rows: GscUrlRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-gray-500">
        Todavía no hay inspecciones guardadas. El job diario (o el botón de arriba) las trae; un dominio nuevo puede tardar días en aparecer.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-medium">URL</th>
            <th className="px-4 py-2 font-medium" title="Veredicto de la inspección de Google y su estado de cobertura">
              Indexación
            </th>
            <th className="px-4 py-2 font-medium" title="Última vez que Googlebot la rastreó">
              Último rastreo
            </th>
            <th className="px-4 py-2 font-medium">Clics 28 d</th>
            <th className="px-4 py-2 font-medium">Impresiones 28 d</th>
            <th className="px-4 py-2 font-medium" title="Posición media ponderada por impresiones">
              Posición
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <tr key={row.url}>
              <td className="px-4 py-2">
                <a
                  href={row.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-[#1A237E] underline-offset-2 hover:underline"
                >
                  {row.path}
                </a>
              </td>
              <td className="px-4 py-2">
                <span className={`font-medium ${TONOS[row.tone]}`}>{row.verdict}</span>
                {row.coverage && <span className="block text-xs text-gray-500">{row.coverage}</span>}
              </td>
              <td className="px-4 py-2 text-gray-600">{row.crawled}</td>
              <td className="px-4 py-2 tabular-nums text-gray-900">{row.clicks}</td>
              <td className="px-4 py-2 tabular-nums text-gray-600">{row.impressions}</td>
              <td className="px-4 py-2 tabular-nums text-gray-600">{row.position}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
