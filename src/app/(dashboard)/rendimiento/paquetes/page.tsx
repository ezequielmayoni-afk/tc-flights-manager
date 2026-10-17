import { Header } from '@/components/layout/Header'
import { PackagePerformanceTable } from '@/components/rendimiento/PackagePerformanceTable'

export const dynamic = 'force-dynamic'

export default function PackagePerformancePage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Paquetes × ventas" />
      <div className="flex-1 p-6 overflow-auto"><PackagePerformanceTable /></div>
    </div>
  )
}
