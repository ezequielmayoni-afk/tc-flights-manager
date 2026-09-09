import { describe, expect, it } from 'vitest'
import { longWeekends } from '../collectors/feriados'
import { summarizeSeries } from '../collectors/bcra'
import { extractDestination } from '../collectors/autocomplete'
import { aggregateByDestination } from '../collectors/search-console'

describe('longWeekends', () => {
  const feriados = [
    { fecha: '2026-03-23', tipo: 'puente', nombre: 'Puente turístico' },
    { fecha: '2026-03-24', tipo: 'inamovible', nombre: 'Día de la Memoria' },
    { fecha: '2026-05-01', tipo: 'inamovible', nombre: 'Día del Trabajador' },
    { fecha: '2026-06-17', tipo: 'inamovible', nombre: 'Güemes' }, // miércoles suelto
  ]

  it('arma los fines de semana largos futuros con feriado', () => {
    const result = longWeekends(feriados, new Date(Date.UTC(2026, 2, 1)), 120)
    expect(result.map(w => `${w.start}..${w.end}:${w.days}`)).toEqual([
      '2026-03-21..2026-03-24:4',
      '2026-05-01..2026-05-03:3',
    ])
    expect(result[0].names).toEqual(['Puente turístico', 'Día de la Memoria'])
    expect(result[0].daysUntil).toBe(20)
  })

  it('no incluye los que ya pasaron', () => {
    const result = longWeekends(feriados, new Date(Date.UTC(2026, 3, 1)), 120)
    expect(result.map(w => w.start)).toEqual(['2026-05-01'])
  })
})

describe('summarizeSeries', () => {
  it('último valor, promedio semanal y variaciones', () => {
    const points = [
      { fecha: '2026-08-08', valor: 1400 },
      { fecha: '2026-09-01', valor: 1500 },
      { fecha: '2026-09-05', valor: 1520 },
      { fecha: '2026-09-08', valor: 1540 },
    ]
    const s = summarizeSeries(points, new Date(Date.UTC(2026, 8, 9)))
    expect(s.last).toBe(1540)
    expect(s.lastDate).toBe('2026-09-08')
    expect(s.weekAvg).toBe(1530)
    expect(s.change7dPct).toBe(2.7)   // vs 1500 (2026-09-01, el último ≤ 7 días atrás)
    expect(s.change30dPct).toBe(10)   // vs 1400
  })

  it('serie vacía', () => {
    expect(summarizeSeries([]).last).toBeNull()
  })
})

describe('extractDestination', () => {
  it('saca el destino de la sugerencia sin la cola de stopwords', () => {
    expect(extractDestination('viaje a cancún todo incluido', 'viaje a ')).toBe('Cancún')
    expect(extractDestination('paquete a punta cana 2027', 'paquete a ')).toBe('Punta Cana')
    expect(extractDestination('vacaciones en bariloche invierno', 'vacaciones en ')).toBe('Bariloche')
    expect(extractDestination('todo incluido cancún', 'todo incluido ')).toBe('Cancún')
    expect(extractDestination('cancun desde buenos aires', 'viaje a ')).toBe('Cancun')
  })

  it('respeta nombres compuestos y artículos iniciales', () => {
    expect(extractDestination('viaje a mar del plata', 'viaje a ')).toBe('Mar del Plata')
    expect(extractDestination('viaje a rio de janeiro', 'viaje a ')).toBe('Rio de Janeiro')
    expect(extractDestination('viaje a la habana', 'viaje a ')).toBe('La Habana')
    expect(extractDestination('vuelos a las vegas', 'vuelos a ')).toBe('Las Vegas')
    expect(extractDestination('paquete a playa del carmen', 'paquete a ')).toBe('Playa del Carmen')
    expect(extractDestination('playas de brasil', 'playas ')).toBe('Brasil')
    expect(extractDestination('viaje a miami y orlando', 'viaje a ')).toBe('Miami')
  })

  it('sin destino devuelve null', () => {
    expect(extractDestination('viaje a ', 'viaje a ')).toBeNull()
    expect(extractDestination('vacaciones julio 2027', 'vacaciones julio ')).toBeNull()
  })
})

describe('aggregateByDestination', () => {
  it('suma impresiones y clics por destino semilla', () => {
    const rows = [
      { query: 'paquetes a punta cana', clicks: 10, impressions: 500, ctr: 0.02, position: 3 },
      { query: 'punta cana todo incluido', clicks: 5, impressions: 300, ctr: 0.02, position: 5 },
      { query: 'viajes a roma', clicks: 1, impressions: 50, ctr: 0.02, position: 8 },
    ]
    const byDest = aggregateByDestination(rows)
    expect(byDest.get('punta-cana')).toMatchObject({ impressions: 800, clicks: 15 })
    expect(byDest.get('roma')).toMatchObject({ impressions: 50 })
    expect(byDest.get('cancun')).toBeUndefined()
  })
})

describe('registerSuggestion + finalizeDiscoveries', () => {
  it('descarta lo que nunca apareció detrás de una semilla de lugar y unifica variantes', async () => {
    const { registerSuggestion, finalizeDiscoveries } = await import('../collectors/autocomplete')
    const discovered = new Map()
    registerSuggestion(discovered, 'viaje a cancun todo incluido', 'viaje a ')
    registerSuggestion(discovered, 'paquete a cancun', 'paquete a ')
    registerSuggestion(discovered, 'viaje en grupo de personas', 'viaje en grupo ')
    registerSuggestion(discovered, 'viaje en grupo familia', 'viaje en grupo ')
    registerSuggestion(discovered, 'vuelos a curazao', 'vuelos a ')
    registerSuggestion(discovered, 'todo incluido curaçao', 'todo incluido ')
    registerSuggestion(discovered, 'luna de miel maldivas', 'luna de miel ')

    const signals = finalizeDiscoveries(discovered)
    expect(signals.get('cancun')).toMatchObject({ rawScore: 2, normalizedScore: 100, metadata: { name: 'Cancún', placeMentions: 2 } })
    expect(signals.get('curacao')).toMatchObject({ rawScore: 2, metadata: { name: 'Curaçao', placeMentions: 1 } })
    expect(signals.has('personas')).toBe(false)
    expect(signals.has('familia')).toBe(false)
    // Maldivas es semilla: entra aunque sólo apareció tras "luna de miel"
    expect(signals.get('maldivas')).toMatchObject({ rawScore: 1, metadata: { placeMentions: 0 } })
  })
})
