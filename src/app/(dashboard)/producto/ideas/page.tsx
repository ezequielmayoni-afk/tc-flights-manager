import { redirect } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { Header } from '@/components/layout/Header'
import { IdeasBoard } from '@/components/producto/IdeasBoard'

export const dynamic = 'force-dynamic'

async function loadProfiles() {
  const db = createAdminClient()
  const { data } = await db.from('destination_profiles').select('code, name, family, nights_default, regimen_required, stars_min, direct_required, cotizador_instance').eq('active', true).order('family').order('name')
  return (data ?? []) as Array<{ code: string; name: string; family: string; nights_default: number; regimen_required: string | null; stars_min: number; direct_required: boolean; cotizador_instance: string }>
}

/** Ideas de paquete (Fase 3): de "qué armar" a precio real de siviajo.com, con aprobación humana. */
export default async function IdeasPage() {
  const { authorized } = await checkSectionAccess('producto')
  if (!authorized) redirect('/dashboard')
  const profiles = await loadProfiles()
  return (
    <div className="flex flex-col">
      <Header title="Ideas de paquete" />
      <div className="p-6">
        <IdeasBoard profiles={profiles} />
      </div>
    </div>
  )
}
