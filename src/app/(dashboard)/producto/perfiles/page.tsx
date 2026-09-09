import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { ProfilesTable } from '@/components/producto/ProfilesTable'

export const dynamic = 'force-dynamic'

/** Usos y costumbres por destino: lo que las ideas, las tiradas y la recotización respetan. */
export default async function PerfilesPage() {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) redirect('/dashboard')
  const db = createAdminClient()
  const { data } = await db.from('destination_profiles').select('*').order('family').order('name')
  return (
    <div className="flex flex-col">
      <Header title="Perfiles de destino" />
      <div className="p-6">
        <section className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-gray-900">Usos y costumbres</h2>
            <p className="text-xs text-gray-500">Régimen obligatorio, noches habituales, categoría mínima, temporada alta y cuánto ahorro justifica una escala. Una idea que no cumple una regla dura no se cotiza; los desvíos de los paquetes activos se auditan cada lunes.</p>
          </div>
          <ProfilesTable profiles={(data ?? []) as never} />
        </section>
      </div>
    </div>
  )
}
