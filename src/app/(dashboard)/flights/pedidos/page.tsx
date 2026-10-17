import { Header } from '@/components/layout/Header'
import { CupoRequestsBoard } from '@/components/cupos/CupoRequestsBoard'

export const dynamic = 'force-dynamic'

export default function CupoRequestsPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Pedidos de cupos a aéreos" />
      <div className="flex-1 p-6 overflow-auto"><CupoRequestsBoard /></div>
    </div>
  )
}
