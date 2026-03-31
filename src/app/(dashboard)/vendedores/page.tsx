import { Header } from '@/components/layout/Header'
import { VendedoresDashboard } from '@/components/vendedores/VendedoresDashboard'
import { fetchVendedoresData } from '@/lib/google-sheets/client'

export const dynamic = 'force-dynamic'

const SPREADSHEET_ID = '1fSjNwKpXVrq38RAd2NQJ-Oq2bSVomxGhEUfBa1sI5Ck'
const GID = 1408433781

export default async function VendedoresPage() {
  let data = null
  let error = null

  try {
    data = await fetchVendedoresData(SPREADSHEET_ID, GID)
  } catch (err) {
    console.error('Error fetching vendedores data:', err)
    error = err instanceof Error ? err.message : 'Error desconocido'
  }

  return (
    <>
      <Header title="Vendedores" />
      <div className="p-6">
        {error ? (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
            <p className="font-medium">Error al cargar datos</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        ) : data ? (
          <VendedoresDashboard initialData={data} />
        ) : (
          <p>Sin datos disponibles.</p>
        )}
      </div>
    </>
  )
}
