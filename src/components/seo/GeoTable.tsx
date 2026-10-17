/** Qué dijo un motor sobre una pregunta en la semana que se muestra. */
export interface GeoCell {
  engine: string
  engineLabel: string
  state: 'mentioned' | 'cited' | 'absent' | 'error' | 'missing'
  /** Para `state: 'error'`: el error del motor, va en el `title` del chip. */
  error: string | null
  /** Respuesta recortada a ~600 caracteres, o null si no hubo. */
  answer: string | null
  /** Modelo que respondió, para leer la respuesta con contexto. */
  model: string | null
}

export interface GeoRow {
  promptId: number
  prompt: string
  category: string
  cells: GeoCell[]
}

const CHIP: Record<GeoCell['state'], { label: string; className: string }> = {
  mentioned: { label: 'Menciona', className: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  cited: { label: 'Cita', className: 'bg-emerald-700 text-white ring-emerald-800' },
  absent: { label: 'No aparece', className: 'bg-gray-100 text-gray-600 ring-gray-200' },
  error: { label: 'Error', className: 'bg-amber-50 text-amber-800 ring-amber-200' },
  missing: { label: 'Sin sondar', className: 'bg-white text-gray-400 ring-gray-200' },
}

function Chip({ cell }: { cell: GeoCell }) {
  const { label, className } = CHIP[cell.state]
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`} title={cell.state === 'error' ? (cell.error ?? 'Error') : undefined}>
      {label}
    </span>
  )
}

/**
 * Qué responde la IA: una fila por pregunta, un chip por motor y, debajo, la
 * respuesta de cada motor plegada para poder leerla sin que la tabla crezca.
 */
export function GeoTable({ rows, engines }: { rows: GeoRow[]; engines: Array<{ engine: string; label: string }> }) {
  if (rows.length === 0) {
    return <p className="px-4 py-3 text-xs text-gray-500">Todavía no hay sondas: el job semanal corre los lunes o apretá Sondear IA.</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="px-4 py-2 font-medium">Pregunta</th>
            {engines.map(e => (
              <th key={e.engine} className="px-4 py-2 font-medium">
                {e.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map(row => {
            const respuestas = row.cells.filter(c => c.answer)
            return (
              <tr key={row.promptId} className="align-top">
                <td className="px-4 py-2">
                  <p className="text-gray-900">{row.prompt}</p>
                  <p className="text-xs text-gray-500">{row.category}</p>
                  {respuestas.length > 0 && (
                    <div className="mt-1 space-y-1">
                      {respuestas.map(c => (
                        <details key={c.engine} className="text-xs text-gray-600">
                          <summary className="cursor-pointer select-none text-[#1A237E] underline-offset-2 hover:underline">
                            Respuesta de {c.engineLabel}
                            {c.model ? <span className="text-gray-400"> · {c.model}</span> : null}
                          </summary>
                          <p className="mt-1 whitespace-pre-line rounded border border-gray-100 bg-gray-50 px-2 py-1.5">{c.answer}</p>
                        </details>
                      ))}
                    </div>
                  )}
                </td>
                {row.cells.map(cell => (
                  <td key={cell.engine} className="px-4 py-2">
                    <Chip cell={cell} />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
