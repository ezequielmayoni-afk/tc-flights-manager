/**
 * TC ticket-contract endpoint discovery (read-only).
 * Run: npx tsx src/tc/probe.ts
 * Findings (verified 2026-06): the ticket product lives at /tickets/{supplierId}
 * (POST create, PUT /{ticketCode} update). Body model = ContractTicketVO.
 * Modalities (price options / sectors) at POST /tickets/{supplierId}/{ticketCode}.
 * GET list requires `first` and `limit` as HEADERS. Existing F1 examples in the
 * account: "Tickets GP F Monza", "Tickets GP F1 Zandvoort-Países Bajos".
 */
import { tc, TC_SUPPLIER } from './client.js'

async function main() {
  const list = await tc<Record<string, unknown>>(`/tickets/${TC_SUPPLIER}`, {}, { first: '0', limit: '5' })
  console.log('GET /tickets/%s -> %d', TC_SUPPLIER, list.status)
  const data = list.body as { ticket?: Array<{ code: string; name: string; modalityCodes?: string[] }> }
  for (const x of data.ticket || []) console.log(`  code=${JSON.stringify(x.code)} name=${x.name} modalities=${JSON.stringify(x.modalityCodes)}`)
}
main().catch((e) => { console.error(e); process.exit(1) })
