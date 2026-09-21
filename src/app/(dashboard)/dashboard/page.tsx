import { Header } from '@/components/layout/Header'
import { DashboardStats } from '@/components/dashboard/DashboardStats'
import { CuposSummary } from '@/components/dashboard/CuposSummary'

export default function DashboardPage() {
  return (
    <div className="flex flex-col h-full">
      <Header title="Dashboard" />

      <div className="flex-1 p-6 overflow-auto space-y-6">
        <CuposSummary />
        <DashboardStats />
      </div>
    </div>
  )
}
