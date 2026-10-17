import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { FlightForm } from '@/components/flights/FlightForm'
import { flightPrefillFromOption } from '@/lib/cupos/flight-prefill'

async function getCatalogs() {
  const supabase = await createClient()

  const [airlinesRes, airportsRes, suppliersRes] = await Promise.all([
    supabase.from('airlines').select('code, name').order('code'),
    supabase.from('airports').select('code, name, city').order('code'),
    supabase.from('suppliers').select('id, name').order('name'),
  ])

  return {
    airlines: airlinesRes.data || [],
    airports: airportsRes.data || [],
    suppliers: suppliersRes.data || [],
  }
}

export default async function NewFlightPage({ searchParams }: { searchParams: Promise<{ option?: string }> }) {
  const { airlines, airports, suppliers } = await getCatalogs()
  const { option } = await searchParams
  const optionId = option ? Number(option) : null
  const prefill = optionId ? await flightPrefillFromOption(optionId, suppliers) : null

  return (
    <div className="flex flex-col h-full">
      <Header title={prefill ? `Nuevo cupo desde el pedido #${prefill.requestId}` : 'Nuevo vuelo'} />

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl">
          {prefill && <p className="mb-4 text-sm text-muted-foreground">Prellenado con la tirada aceptada: {prefill.summary}. Revisá horarios, precios de venta y equipaje antes de guardar; al guardar, el cupo queda enlazado al pedido con su costo por plaza.</p>}
          <FlightForm airlines={airlines} airports={airports} suppliers={suppliers} initialData={prefill?.initialData} cupoOptionId={optionId ?? undefined} />
        </div>
      </div>
    </div>
  )
}
