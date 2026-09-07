import { tcClient } from '@/lib/travelcompositor/client'
import { mapFlightToTransport, mapModalityToTC, createDefaultModality, type DBFlight } from '@/lib/travelcompositor/mapper'
import type { createAdminClient } from '@/lib/supabase/admin'

// Helper to sync a single flight (transport + modality)
// Uses flight.supplier_id to sync to the correct supplier in TC
export async function syncSingleFlight(
  db: ReturnType<typeof createAdminClient>,
  flight: DBFlight,
  combinableRtContracts: string[] = []
): Promise<{ success: boolean; transportId?: string; error?: string }> {
  // Override combinable_rt_contracts if provided
  const flightWithCombinables = {
    ...flight,
    combinable_rt_contracts: combinableRtContracts.length > 0 ? combinableRtContracts : flight.combinable_rt_contracts,
  }

  // Map to TC format
  const tcTransport = mapFlightToTransport(flightWithCombinables)

  // Use flight's supplier_id for TC API URL
  const supplierId = flight.supplier_id

  console.log(`[SYNC] Syncing flight ${flight.id} to supplier ${supplierId}`)

  // TC valida "modalityAvailableWhenActive" al crear: un transporte activo debe tener
  // al menos una modalidad, pero el body de creación (ContractTransportVO) no acepta
  // modalidades. Por eso se crea inactivo, se sube la modalidad y luego se activa (PUT).
  const isCreate = !tcTransport.id
  const needsDeferredActivation = isCreate && tcTransport.active

  // Sync transport to TC with the correct supplier_id
  const result = await tcClient.syncTransport(
    needsDeferredActivation ? { ...tcTransport, active: false } : tcTransport,
    supplierId
  )

  if (!result.success) {
    await db
      .from('flights')
      .update({
        sync_status: 'error',
        sync_error: result.error,
      })
      .eq('id', flight.id)

    return { success: false, error: result.error }
  }

  const transportId = result.transportId!

  // Save TC transport ID if new
  if (!flight.tc_transport_id) {
    await db
      .from('flights')
      .update({ tc_transport_id: transportId })
      .eq('id', flight.id)
  }

  // Sync modalities
  // If flight already had a tc_transport_id, we're updating (use PUT), otherwise creating (use POST)
  const isModalityUpdate = !!flight.tc_transport_id
  const modalities = flight.modalities || []
  let modalitySyncError: string | null = null

  if (modalities.length > 0) {
    const dbModality = modalities[0]
    const tcModality = mapModalityToTC(dbModality, flight.start_date, flight.end_date)
    const modalityResult = await tcClient.syncModality(transportId, tcModality, isModalityUpdate, supplierId)
    if (!modalityResult.success) {
      modalitySyncError = modalityResult.error || 'Modality sync failed'
    }
  } else {
    const defaultModality = createDefaultModality(flight)
    const modalityResult = await tcClient.syncModality(transportId, defaultModality, isModalityUpdate, supplierId)
    if (!modalityResult.success) {
      modalitySyncError = modalityResult.error || 'Default modality sync failed'
    }
  }

  // Activar el transporte recién creado (ya tiene modalidad, TC acepta active: true)
  if (needsDeferredActivation && !modalitySyncError) {
    const activateResult = await tcClient.syncTransport(
      { ...tcTransport, id: transportId, active: true },
      supplierId
    )
    if (!activateResult.success) {
      modalitySyncError = activateResult.error || 'Transport activation failed'
    }
  }

  // Update flight status and combinable_rt_contracts
  await db
    .from('flights')
    .update({
      sync_status: modalitySyncError ? 'error' : 'synced',
      sync_error: modalitySyncError,
      last_sync_at: new Date().toISOString(),
      combinable_rt_contracts: combinableRtContracts.length > 0 ? combinableRtContracts : flight.combinable_rt_contracts,
    })
    .eq('id', flight.id)

  // Log the sync to sync_logs table
  const isUpdate = !!flight.tc_transport_id
  await db.from('sync_logs').insert({
    entity_type: 'flight',
    entity_id: flight.id,
    action: isUpdate ? 'update' : 'create',
    direction: 'push',
    status: modalitySyncError ? 'error' : 'success',
    error_message: modalitySyncError || null,
    request_payload: { ...tcTransport, _supplierId: supplierId },
    response_payload: { transportId, name: flight.name, base_id: flight.base_id, supplier_id: supplierId },
  })

  return {
    success: true,
    transportId,
    error: modalitySyncError || undefined,
  }
}
