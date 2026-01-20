import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { FlightForm } from '@/components/flights/FlightForm'

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

export default async function NewFlightPage() {
  const { airlines, airports, suppliers } = await getCatalogs()

  return (
    <div className="flex flex-col h-full">
      <Header title="Nuevo vuelo" />

      <div className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl">
          <FlightForm airlines={airlines} airports={airports} suppliers={suppliers} />
        </div>
      </div>
    </div>
  )
}
