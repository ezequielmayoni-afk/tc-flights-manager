import { NextResponse } from 'next/server'
import { listSuppliers } from '@/lib/travelcompositor/client'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkSectionAccess } from '@/lib/auth'
import { errorResponse } from '@/lib/api/errors'


/**
 * POST /api/suppliers/sync
 * Fetch suppliers from TravelCompositor and sync them to the database
 */
export async function POST() {
  const { authorized } = await checkSectionAccess('cupos')
  if (!authorized) return NextResponse.json({ error: 'No autorizado' }, { status: 403 })

  try {
    console.log('[Suppliers Sync] Starting sync from TravelCompositor')

    // Fetch suppliers from TC
    const tcSuppliers = await listSuppliers()
    console.log(`[Suppliers Sync] Fetched ${tcSuppliers.length} suppliers from TC`)

    if (tcSuppliers.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No suppliers found in TravelCompositor',
        created: 0,
        updated: 0,
      })
    }

    const db = createAdminClient()

    // Get existing suppliers from DB
    const { data: existingSuppliers } = await db
      .from('suppliers')
      .select('id, name')

    const existingMap = new Map(existingSuppliers?.map((s) => [s.id, s.name]) || [])

    let created = 0
    let updated = 0

    for (const supplier of tcSuppliers) {
      const existingName = existingMap.get(supplier.id)

      if (existingName === undefined) {
        // New supplier - insert
        const { error } = await db
          .from('suppliers')
          .insert({ id: supplier.id, name: supplier.name })

        if (error) {
          console.error(`[Suppliers Sync] Error inserting supplier ${supplier.id}:`, error)
        } else {
          created++
          console.log(`[Suppliers Sync] Created supplier: ${supplier.id} - ${supplier.name}`)
        }
      } else if (existingName !== supplier.name) {
        // Existing supplier with different name - update
        const { error } = await db
          .from('suppliers')
          .update({ name: supplier.name })
          .eq('id', supplier.id)

        if (error) {
          console.error(`[Suppliers Sync] Error updating supplier ${supplier.id}:`, error)
        } else {
          updated++
          console.log(`[Suppliers Sync] Updated supplier: ${supplier.id} - ${supplier.name}`)
        }
      }
    }

    console.log(`[Suppliers Sync] Completed: ${created} created, ${updated} updated`)

    return NextResponse.json({
      success: true,
      message: `Sync completed: ${created} created, ${updated} updated`,
      created,
      updated,
      total: tcSuppliers.length,
    })
  } catch (error) {
    console.error('[Suppliers Sync] Error:', error)
    return errorResponse(error)
  }
}
