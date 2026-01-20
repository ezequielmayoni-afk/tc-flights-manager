import { Sidebar } from '@/components/layout/Sidebar'
import { Toaster } from '@/components/ui/sonner'
import { ErrorBoundaryWrapper } from '@/components/error-boundary'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <ErrorBoundaryWrapper>
          {children}
        </ErrorBoundaryWrapper>
      </main>
      <Toaster position="top-right" />
    </div>
  )
}
