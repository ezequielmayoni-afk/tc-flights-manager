import { Header } from '@/components/layout/Header'
import { OperatorCuposTable } from '@/components/cupos/OperatorCuposTable'

export const dynamic = 'force-dynamic'

export default function OperatorCuposPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Cupos de operadores" />
      <div className="flex-1 p-6 overflow-auto"><OperatorCuposTable /></div>
    </div>
  )
}
