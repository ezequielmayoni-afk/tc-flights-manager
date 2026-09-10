import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { AlertTriangle, Plane } from 'lucide-react'
import { RequoteTable } from '@/components/packages/RequoteTable'
import { CuposAgotadosSection } from '@/components/tareas/CuposAgotadosSection'
import { AdDecisionsSection } from '@/components/tareas/AdDecisionsSection'

export const dynamic = 'force-dynamic'

type PackageNeedingRequote = Parameters<typeof RequoteTable>[0]['packages'][number]

/**
 * Mismo criterio que tenía la pantalla de cotización manual: los que el bot
 * dejó en 'needs_manual' y siguen monitoreados, ordenados por vencimiento.
 */
async function getPackagesNeedingRequote(): Promise<PackageNeedingRequote[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('packages')
    .select(`
      id,
      tc_package_id,
      title,
      date_range_start,
      date_range_end,
      current_price_per_pax,
      currency,
      target_price,
      requote_price,
      requote_variance_pct,
      last_requote_at,
      needs_manual_since,
      manual_quote_completed_at,
      requote_status,
      requote_note,
      air_cost,
      land_cost,
      adults_count,
      children_count,
      status,
      send_to_design,
      send_to_marketing,
      transports_count,
      hotels_count,
      transfers_count,
      cars_count,
      tickets_count,
      tours_count,
      airline_code,
      airline_name,
      flight_numbers,
      flight_departure_date,
      package_hotels(hotel_name, board_type)
    `)
    .eq('requote_status', 'needs_manual')
    .eq('monitor_enabled', true)
    .order('needs_manual_since', { ascending: true, nullsFirst: false })
    .order('requote_variance_pct', { ascending: false })

  if (error) {
    console.error('[Tareas] Error cargando cotizaciones manuales:', error)
    return []
  }

  return (data as PackageNeedingRequote[]) || []
}

export default async function TareasPage() {
  const requotePackages = await getPackagesNeedingRequote()

  return (
    <div className="flex flex-col h-full">
      <Header title="Tareas pendientes" />

      <div className="flex-1 p-6 space-y-8">
        {/* Cotización manual */}
        <section>
          <AdDecisionsSection />
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold">Cotización manual</h2>
            <span className="text-sm text-muted-foreground">
              {requotePackages.length} pendiente{requotePackages.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="bg-white rounded-lg border">
            {requotePackages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No hay paquetes esperando cotización manual
              </p>
            ) : (
              <RequoteTable packages={requotePackages} />
            )}
          </div>
        </section>

        {/* Cupos agotados */}
        <section>
          <div className="flex items-center gap-2 mb-3">
            <Plane className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-semibold">Cupos agotados con paquetes publicados</h2>
          </div>
          <CuposAgotadosSection />
        </section>
      </div>
    </div>
  )
}
