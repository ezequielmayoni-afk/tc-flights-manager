import type { createAdminClient } from '@/lib/supabase/admin'

type Db = ReturnType<typeof createAdminClient>

/**
 * Un paquete es "de cupo" cuando el aéreo no es una tarifa de mercado sino
 * lugares que ya tenemos comprados. Se reconoce por dos formas:
 *
 * 1. El aéreo viene como transporte de contrato: TC lo devuelve con `supplier`
 *    cargado ("Sí, viajo", "Jetsmart", "Tower Travel"), un transporte por tramo
 *    (ida y vuelta separados), fixed/mandatory y bookingClass = nuestra
 *    modalidad. Los retail vienen sin supplier, con fare LIGHT/BASE y una clase
 *    de reserva del GDS.
 *
 * 2. El paquete tiene un circuito cerrado (grupales acompañadas, circuitos,
 *    charters). Ahí el aéreo va adentro del tour: TC ni siquiera devuelve
 *    transportes, así que la señal 1 no alcanza.
 *
 * En ninguno de los dos casos tiene sentido monitorear el precio: no se
 * recotiza contra el mercado.
 */
export async function getCupoPackageIds(db: Db, packageIds: number[]): Promise<Set<number>> {
  const cupo = new Set<number>()
  if (packageIds.length === 0) return cupo

  // 1) Aéreo cargado como transporte de contrato (supplier propio)
  const { data: transports } = await db
    .from('package_transports')
    .select('package_id')
    .in('package_id', packageIds)
    .not('supplier_name', 'is', null)

  for (const t of transports || []) cupo.add(t.package_id)

  // 2) Paquetes con circuito cerrado
  const { data: withTours } = await db
    .from('packages')
    .select('id')
    .in('id', packageIds)
    .gt('tours_count', 0)

  for (const p of withTours || []) cupo.add(p.id)

  return cupo
}
