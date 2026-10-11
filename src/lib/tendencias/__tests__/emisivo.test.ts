import { describe, expect, it } from 'vitest'
import { DESTINATION_SEEDS, getAllDestinations, isDomestic, mentionsDomestic } from '../config'
import { buildKnown } from '../collectors/known'
import { finalizeDiscoveries, registerSuggestion, type Discovered } from '../collectors/autocomplete'

describe('Tendencias es sólo turismo emisivo (2026-10-11)', () => {
  it('isDomestic reconoce lo que está dentro de Argentina, con o sin sufijo', () => {
    for (const s of ['bariloche', 'san-carlos-de-bariloche', 'mendoza', 'cordoba', 'salta', 'jujuy', 'mar-del-plata', 'villa-gesell', 'ushuaia', 'el-calafate', 'cataratas-del-iguazu', 'carlos-paz', 'buquebus', 'bariloche-2027', 'patagonia-argentina']) expect(isDomestic(s), s).toBe(true)
    for (const s of ['punta-cana', 'rio-de-janeiro', 'florianopolis', 'madrid', 'punta-del-este', 'santiago-de-chile', 'valle-nevado', 'miami', 'colombia', 'santa-marta']) expect(isDomestic(s), s).toBe(false)
  })
  it('no queda ninguna semilla nacional', () => {
    expect(DESTINATION_SEEDS.argentina).toBeUndefined()
    expect(getAllDestinations().filter(d => isDomestic(d.slug)).map(d => d.name)).toEqual([])
  })
  it('un destino nacional descubierto por Google no entra al conjunto conocido', () => {
    const known = buildKnown(new Map([['jujuy', 'Jujuy'], ['bombinhas', 'Bombinhas']]))
    expect(known.names.has('jujuy')).toBe(false)
    expect(known.names.has('bombinhas')).toBe(true)
  })
  it('finalizeDiscoveries descarta lo nacional aunque tenga menciones de lugar', () => {
    const discovered = new Map<string, Discovered>()
    registerSuggestion(discovered, 'viaje a bariloche', 'viaje a ', 'viaje a', 1)
    registerSuggestion(discovered, 'viaje a bariloche en julio', 'viaje a ', 'viaje a', 2)
    registerSuggestion(discovered, 'viaje a punta cana', 'viaje a ', 'viaje a', 3)
    const out = finalizeDiscoveries(discovered)
    expect(out.has('bariloche')).toBe(false)
    expect(out.has('punta-cana')).toBe(true)
  })

  it('mentionsDomestic detecta lugares argentinos dentro de una frase', () => {
    for (const t of ['vuelos a salta', 'temporal en bariloche', 'paquetes a mar del plata 2027', 'escapada a villa carlos paz', 'cataratas del iguazu en auto']) expect(mentionsDomestic(t), t).toBe(true)
    for (const t of ['vuelos a madrid', 'paquetes a punta cana', 'aerolineas argentinas paro', 'viaje a colonia del sacramento']) expect(mentionsDomestic(t), t).toBe(false)
  })
})
