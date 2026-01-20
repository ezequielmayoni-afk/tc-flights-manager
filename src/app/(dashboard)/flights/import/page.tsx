import { Header } from '@/components/layout/Header'
import { ImportFlightsClient } from './ImportFlightsClient'

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
