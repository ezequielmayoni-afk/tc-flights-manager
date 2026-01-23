import { Header } from '@/components/layout/Header'
import { ImportFlightsClient } from './ImportFlightsClient'

// Force dynamic rendering to avoid build-time errors
export const dynamic = 'force-dynamic'

export default function ImportFlightsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Importar Vuelos desde TravelCompositor" />

      <div className="flex-1 p-6">
        <ImportFlightsClient />
      </div>
    </div>
  )
}
