import { supabase } from './supabase.js'
import { buildContractTicket, buildModality, pushTicket, displayImage, type P1EventRow, type P1TicketRow } from './tc/ticketContract.js'

// Push ONE p1 event (by name substring) to TravelCompositor as a ticket-contract.
// Usage: npx tsx src/run-push-tc.ts "British GP" [--dry]
async function main() {
  const args = process.argv.slice(2)
  const dry = args.includes('--dry')
  const query = args.filter((a) => !a.startsWith('--')).join(' ').trim()
  if (!query) { console.error('Uso: run-push-tc "<nombre evento>" [--dry]'); process.exit(1) }

  const { data: ev } = await supabase.from('p1_events')
    .select('id,event_uuid,slug,name,venue_name,city,country_code,lat,lng,date_time,date_time_end,main_image_url,marketing_label,description,currency')
    .ilike('name', `%${query}%`).eq('active', true).order('date_time').limit(1).maybeSingle()
  if (!ev) { console.error(`No se encontró evento activo que matchee "${query}"`); process.exit(1) }

  const { data: tickets } = await supabase.from('p1_tickets')
    .select('category_id,name,description,seatplan_image_url,price,currency,features')
    .eq('event_id', (ev as P1EventRow).id)
    .eq('availability', 'available') // no pushear sectores que P1 ya no vende
    .order('price')

  const E = ev as P1EventRow, T = (tickets || []) as P1TicketRow[]
  console.log(`Evento: ${E.name} | ${T.length} sectores | ${E.city} (${E.country_code})`)

  // Review de imágenes: qué sector quedó con foto real vs banner de fallback.
  const seat = T.filter((t) => displayImage(t).source === 'seat_photo')
  const banner = T.filter((t) => displayImage(t).source === 'gp_banner')
  const none = T.filter((t) => displayImage(t).source === 'none')
  console.log(`\n=== Revisión de imágenes: ${seat.length} con foto real, ${banner.length} con banner del GP, ${none.length} sin imagen ===`)
  for (const t of T) {
    const di = displayImage(t)
    const tag = di.source === 'seat_photo' ? '📷 FOTO ' : di.source === 'gp_banner' ? '🏁 banner' : '⚠️  NINGUNA'
    console.log(`  ${tag} | ${t.name}${di.caption ? '  ("' + di.caption + '")' : ''}`)
    if (di.url) console.log(`            ${di.url}`)
  }

  if (dry) {
    const contract = buildContractTicket(E, T)
    console.log('\n=== ContractTicketVO (dry) ===')
    console.log(JSON.stringify(contract, null, 2))
    console.log('\n=== Modalidades (dry) ===')
    for (const t of T) console.log(JSON.stringify(buildModality(E, t)))
    console.log(`\n[dry] No se pusheó nada. Crearía ticket "${contract.code}" + ${T.length} modalidades.`)
    return
  }

  console.log('\nPusheando a TravelCompositor...')
  const r = await pushTicket(E, T)
  console.log(`ticket ${r.method} -> ${r.ticketStatus} | code=${r.code}`)
  for (const m of r.modResults) console.log(`  modalidad ${m.ok ? 'OK' : 'FALLÓ'} (${m.status}) — ${m.code}${m.err?' :: '+m.err:''}`)
  const okMods = r.modResults.filter((m) => m.ok).length
  console.log(`\nListo: ticket + ${okMods}/${r.modResults.length} modalidades en TC.`)
}
main().catch((e) => { console.error(e); process.exit(1) })
