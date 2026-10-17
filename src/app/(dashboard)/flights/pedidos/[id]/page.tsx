import { Header } from '@/components/layout/Header'
import { CupoRequestDetail } from '@/components/cupos/CupoRequestDetail'

export const dynamic = 'force-dynamic'

export default async function CupoRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return (
    <div className="flex flex-col h-full">
      <Header title={`Pedido de cupos #${id}`} />
      <div className="flex-1 p-6 overflow-auto"><CupoRequestDetail id={Number(id)} /></div>
    </div>
  )
}
