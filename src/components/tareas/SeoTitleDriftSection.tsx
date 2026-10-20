import { createAdminClient } from '@/lib/supabase/admin'

interface DriftRow {
  id: number
  tc_package_id: number
  url: string | null
  departure_date: string | null
  title_before: string
  title_expected: string
  meta_title_expected: string | null
  meta_desc_expected: string | null
  impressions_28d: number
  clicks_28d: number
  status: string
  detected_at: string
}

function fecha(iso: string | null): string {
  if (!iso) return '—'
  const ts = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(ts) ? iso : new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

/**
 * Fichas cuyo título dice una temporada distinta de la salida cargada en TC
 * (job `seo.title_drift`). Con el flag de auto-aplicación prendido el título y el
 * H1 ya se cambian solos por API; los meta tags se pegan en el back (Paquetes
 * vacacionales → Editar → Meta título / Meta descripción). Se cierran solas cuando
 * la ficha queda con el título correcto.
 */
export async function SeoTitleDriftSection() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('seo_title_drift')
    .select('id, tc_package_id, url, departure_date, title_before, title_expected, meta_title_expected, meta_desc_expected, impressions_28d, clicks_28d, status, detected_at')
    .in('status', ['pending', 'title_applied'])
    .order('impressions_28d', { ascending: false })
    .limit(50)
  const rows = (error ? [] : (data ?? [])) as DriftRow[]

  return (
    <div className="bg-white rounded-lg border">
      {error ? (
        <p className="text-sm text-amber-700 px-4 py-6">No se pudieron leer los desfasajes de temporada: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Todos los títulos coinciden con la salida cargada en TC</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
            <tr>
              <th className="px-4 py-2">Ficha</th>
              <th className="px-4 py-2">Salida en TC</th>
              <th className="px-4 py-2">Título propuesto</th>
              <th className="px-4 py-2">Meta propuestos</th>
              <th className="px-4 py-2 text-right">Impr. 28 d</th>
              <th className="px-4 py-2">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b last:border-0 align-top">
                <td className="px-4 py-2">
                  <a href={r.url ?? `https://www.siviajo.com/es/idea/${r.tc_package_id}/x`} target="_blank" rel="noreferrer" className="font-medium text-[#1A237E] underline underline-offset-2">
                    {r.title_before}
                  </a>
                  <div className="text-xs text-gray-500">TC {r.tc_package_id}</div>
                </td>
                <td className="px-4 py-2 whitespace-nowrap">{fecha(r.departure_date)}</td>
                <td className="px-4 py-2">{r.title_expected}</td>
                <td className="px-4 py-2 text-xs text-gray-700">
                  {r.meta_title_expected ? <div><span className="text-gray-500">Meta título:</span> {r.meta_title_expected}</div> : <div className="text-amber-700">Meta título: no menciona la temporada, revisar a mano</div>}
                  {r.meta_desc_expected ? <div className="mt-1"><span className="text-gray-500">Meta descripción:</span> {r.meta_desc_expected}</div> : null}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.impressions_28d.toLocaleString('es-AR')}</td>
                <td className="px-4 py-2 text-xs">
                  {r.status === 'title_applied' ? (
                    <span className="text-green-700">Título y H1 aplicados por API. Falta pegar los meta en el back.</span>
                  ) : (
                    <span className="text-amber-700">Pendiente: aplicar título por API (o prender automation.seo_title_autoapply) y meta en el back.</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
