import { Header } from '@/components/layout/Header'
import { AirlineContactsPanel } from '@/components/cupos/AirlineContactsPanel'

export const dynamic = 'force-dynamic'

export default function AirlineContactsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Contactos de aerolíneas" />
      <div className="flex-1 p-6 overflow-auto"><AirlineContactsPanel /></div>
    </div>
  )
}
