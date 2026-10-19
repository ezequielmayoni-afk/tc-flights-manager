import { createAdminClient } from '@/lib/supabase/admin'

interface AlertRow {
  id: number
  tc_package_id: number
  package_id: number | null
  title: string | null
  url: string | null
  departure_date: string
  impressions_28d: number
  clicks_28d: number
  alerted_at: string
}

function fecha(iso: string): string {
  const ts = Date.parse(`${iso}T00:00:00Z`)
  return Number.isNaN(ts) ? iso : new Date(ts).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' })
}

function dias(iso: string): string {
  const hoy = new Date().toISOString().slice(0, 10)
  const d = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000)
  if (d < 0) return `venció hace ${-d} d`
  if (d === 0) return 'vence hoy'
  return `vence en ${d} d`
}

/**
 * Fichas con tráfico en Google cuya salida vence o venció (job `seo.expiring`).
 * Se cierran solas cuando la ficha recibe otra fecha. Lo que hay que hacer es
 * cargar la próxima salida o pasarla a sistema; nunca desactivar (404 en TC).
 */
export async function SeoExpiringSection() {
  const db = createAdminClient()
  const { data, error } = await db
    .from('seo_expiring_alerts')
    .select('id, tc_package_id, package_id, title, url, departure_date, impressions_28d, clicks_28d, alerted_at')
    .eq('status', 'open')
    .order('impressions_28d', { ascending: false })
    .limit(50)
  const rows = (error ? [] : (data ?? [])) as AlertRow[]

  return (
    <div className="bg-white rounded-lg border">
      {error ? (
        <p className="text-sm text-amber-700 px-4 py-6">No se pudieron leer las alertas de SEO: {error.message}</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Ninguna ficha con tráfico está por vencer</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
            <tr>
              <th className="px-4 py-2">Ficha</th>
              <th className="px-4 py-2">Salida</th>
              <th className="px-4 py-2 text-right">Impresiones 28 d</th>
              <th className="px-4 py-2 text-right">Clics 28 d</th>
              <th className="px-4 py-2">Qué hacer</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2">
                  <a href={r.url ?? `https://www.siviajo.com/es/idea/${r.tc_package_id}/x`} target="_blank" rel="noreferrer" className="font-medium text-[#1A237E] underline underline-offset-2">
                    {r.title || `Paquete ${r.tc_package_id}`}
                  </a>
                  <div className="text-xs text-gray-500">TC {r.tc_package_id}</div>
                </td>
                <td className="px-4 py-2">
                  <div>{fecha(r.departure_date)}</div>
                  <div className="text-xs text-amber-700">{dias(r.departure_date)}</div>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{r.impressions_28d.toLocaleString('es-AR')}</td>
                <td className="px-4 py-2 text-right tabular-nums">{r.clicks_28d.toLocaleString('es-AR')}</td>
                <td className="px-4 py-2 text-xs text-gray-600">Cargar la próxima salida en la misma ficha o pasarla a sistema. No desactivar: en TC es un 404 y se pierde el posicionamiento.</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
