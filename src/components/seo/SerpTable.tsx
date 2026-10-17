/**
 * Una consulta seguida en Google AR con su lectura más reciente, ya
 * formateada por el server (números, flechas y paths): el componente sólo
 * pinta, no calcula.
 */
export interface SerpRow {
  keywordId: number
  keyword: string
  intent: string
  /** "3" o "—" si no aparece en el top que leemos. */
  position: string
  /** "↑ 2", "↓ 1", "=", "nueva", "entró", "salió". */
  change: string
  changeTone: 'up' | 'down' | 'flat' | 'muted'
  url: string | null
  /** Path corto de la URL que rankea, o null. */
  path: string | null
  /** "sí", "sí · cita" o "no". */
  aiOverview: string
  aiTone: 'ok' | 'warn' | 'muted'
  localPack: string
  competitors: string
}

const CAMBIO: Record<SerpRow['changeTone'], string> = {
  up: 'text-emerald-700',
  down: 'text-red-600',
  flat: 'text-gray-500',
  muted: 'text-gray-400',
}

const AI: Record<SerpRow['aiTone'], string> = {
  ok: 'text-emerald-700',
  warn: 'text-amber-700',
  muted: 'text-gray-500',
}

/** Posiciones en Google AR: la última lectura de cada consulta y cuánto se movió. */
export function SerpTable({ rows }: { rows: SerpRow[] }) {
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-xs text-gray-500">Todavía no hay mediciones: el job semanal corre los lunes o apretá Medir posiciones.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-medium">Consulta</th>
            <th className="px-4 py-2 font-medium">Intención</th>
            <th className="px-4 py-2 font-medium" title="Posición orgánica en Google Argentina (desktop, es-AR)">
              Posición
            </th>
            <th className="px-4 py-2 font-medium" title="Contra la lectura anterior de la misma consulta">
              Cambio
            </th>
            <th className="px-4 py-2 font-medium">URL que rankea</th>
            <th className="px-4 py-2 font-medium" title="Si la búsqueda muestra AI Overview y si cita a siviajo.com">
              AI Overview
            </th>
            <th className="px-4 py-2 font-medium" title="Posición en el pack de Google Maps, si aparece">
              Pack local
            </th>
            <th className="px-4 py-2 font-medium">Competidores en top 10</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => (
            <tr key={row.keywordId}>
              <td className="px-4 py-2 font-medium text-gray-900">{row.keyword}</td>
              <td className="px-4 py-2 text-gray-600">{row.intent}</td>
              <td className="px-4 py-2 tabular-nums text-gray-900">{row.position}</td>
              <td className={`px-4 py-2 tabular-nums ${CAMBIO[row.changeTone]}`}>{row.change}</td>
              <td className="px-4 py-2">
                {row.url && row.path ? (
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="text-[#1A237E] underline-offset-2 hover:underline" title={row.url}>
                    {row.path}
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className={`px-4 py-2 ${AI[row.aiTone]}`}>{row.aiOverview}</td>
              <td className="px-4 py-2 tabular-nums text-gray-600">{row.localPack}</td>
              <td className="px-4 py-2 text-xs text-gray-600">{row.competitors}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
