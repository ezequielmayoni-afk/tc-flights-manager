import { describe, expect, it } from 'vitest'
import { qaCopy } from '../copy/qa'
import { buildCopySystemPrompt, buildCopyUserPrompt } from '../copy/prompt'
import type { CopyPackageData } from '../copy/types'

const base = { variant: 1, angle: 'oferta', headline: 'Punta Cana todo incluido', description: 'Vuelo + hotel', primary_text: 'Punta Cana con todo incluido por USD 1.889 por persona. Nosotros nos ocupamos, vos disfrutás. Escribinos por WhatsApp.' }
const pkg = { pricePerPax: 1889, nights: 7, cupoRemaining: null, boardName: 'todo incluido' }

describe('qaCopy', () => {
  it('aprueba un copy correcto', () => { expect(qaCopy(base, pkg).status).toBe('ok') })
  it('recorta título y descripción largos en vez de rechazar', () => {
    const r = qaCopy({ ...base, headline: 'Punta Cana con todo incluido y vuelo directo desde Buenos Aires', description: 'Vuelo, hotel, traslados y excursiones incluidas' }, pkg)
    expect(r.status).toBe('fixed'); expect(r.copy.headline.length).toBeLessThanOrEqual(40); expect(r.copy.description.length).toBeLessThanOrEqual(30)
  })
  it('rechaza precio inventado, noches inventadas y cupos en un paquete de sistema', () => {
    expect(qaCopy({ ...base, primary_text: 'Punta Cana por USD 1.500 por persona.' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'Punta Cana 10 noches con todo incluido.' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: '¡Últimos lugares para Punta Cana!' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'Quedan 4 lugares para Punta Cana.' }, { ...pkg, cupoRemaining: 4 }).status).toBe('ok')
    expect(qaCopy({ ...base, primary_text: 'Quedan 9 lugares para Punta Cana.' }, { ...pkg, cupoRemaining: 4 }).status).toBe('rejected')
  })
  it('rechaza "todo incluido" cuando el régimen es otro', () => {
    expect(qaCopy({ ...base, primary_text: 'Florianópolis con todo incluido por USD 1.889 por persona.' }, { ...pkg, boardName: 'con desayuno' }).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'Punta Cana con todo incluido por USD 1.889 por persona.' }, { ...pkg, boardName: 'todo incluido' }).status).toBe('ok')
  })
  it('rechaza voz fuera de marca, engagement bait, mayúsculas y promesas', () => {
    expect(qaCopy({ ...base, primary_text: 'Usted puede reservar hoy.' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'Etiquetá a tu amiga que necesita playa.' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'PUNTA CANA TODO INCLUIDO RESERVÁ AHORA MISMO POR WHATSAPP' }, pkg).status).toBe('rejected')
    expect(qaCopy({ ...base, primary_text: 'El mejor precio del mercado, garantizado.' }, pkg).status).toBe('rejected')
  })
})

describe('prompts', () => {
  const data: CopyPackageData = { packageId: 1, tcPackageId: 52574571, title: 'Combinado Punta Cana y Bayahibe', destinations: ['Punta Cana', 'Bayahibe'], primaryDestination: 'Punta Cana', family: 'caribe', hotelName: 'Riu Bambu', hotelStars: 5, boardName: 'Todo incluido', nights: 9, pricePerPax: 2149.19, currency: 'USD', departureDate: '2027-01-17', dateRangeStart: null, dateRangeEnd: null, airline: 'Arajet', directFlight: true, originCity: 'Buenos Aires', includes: { flights: true, hotel: true, transfers: true, tours: false, tickets: false }, cupoRemaining: 6, isOperatorDeparture: false, themes: ['Caribbean'], adults: 2, children: 0 }
  it('el prompt lleva los datos reales y las reglas duras', () => {
    const user = buildCopyUserPrompt(data)
    expect(user).toContain('USD 2.149 por persona'); expect(user).toContain('Riu Bambu'); expect(user).toContain('quedan 6 lugares'); expect(user).toContain('17 de enero de 2027'); expect(user).not.toContain('undefined'); expect(user).not.toContain('null')
    const sys = buildCopySystemPrompt()
    expect(sys).toContain('rioplatense'); expect(sys).toContain('125'); expect(sys).toContain('JSON')
  })
})
