import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const tcPackageIds = [
  38001505, 40427498, 40410518, 36286645, 31709046, 37761547, 37701433, 34147176,
  37688104, 37773262, 37685905, 27110297, 24661476, 38643644, 38204917, 38204302,
  38203321, 39728262, 39636714, 39635286, 36411832, 27778058, 38725839, 39641019,
  31957038, 39098703, 38084605, 38064673, 40657502, 34795353, 32442477, 34343073,
  38506493, 28879286, 36176389, 40175744, 25683099, 31637226, 42192837, 42209478,
  42217665, 42220509, 38327473, 38330524, 38325250, 27776882, 41893803, 42670605,
  42684558, 42996591
]

async function main() {
  console.log(`Updating ${tcPackageIds.length} packages to marketing status...`)

  // First, check how many exist
  const { data: existing, error: checkError } = await supabase
    .from('packages')
    .select('id, tc_package_id, title, send_to_marketing')
    .in('tc_package_id', tcPackageIds)

  if (checkError) {
    console.error('Error checking packages:', checkError)
    return
  }

  const existingCount = existing?.length || 0
  console.log(`Found ${existingCount} packages in database`)

  const alreadyMarketed = existing?.filter(p => p.send_to_marketing) || []
  const toUpdate = existing?.filter(p => !p.send_to_marketing) || []

  console.log(`Already in marketing: ${alreadyMarketed.length}`)
  console.log(`To update: ${toUpdate.length}`)

  if (toUpdate.length === 0) {
    console.log('Nothing to update')
  } else {
    // Update packages
    const { data: updated, error: updateError } = await supabase
      .from('packages')
      .update({
        send_to_marketing: true,
        marketing_status: 'pending'
      })
      .in('tc_package_id', tcPackageIds)
      .eq('send_to_marketing', false)
      .select('id, tc_package_id, title')

    if (updateError) {
      console.error('Error updating:', updateError)
      return
    }

    const updatedCount = updated?.length || 0
    console.log(`\nUpdated ${updatedCount} packages:`)
    updated?.forEach(p => console.log(`  - ${p.tc_package_id}: ${p.title}`))
  }

  // Show missing packages
  const foundIds = new Set(existing?.map(p => p.tc_package_id) || [])
  const missing = tcPackageIds.filter(id => !foundIds.has(id))

  if (missing.length > 0) {
    console.log(`\nMissing packages (not in DB): ${missing.length}`)
    missing.forEach(id => console.log(`  - ${id}`))
  }
}

main()
