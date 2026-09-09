import { describe, expect, it } from 'vitest'
import { longWeekends } from '../collectors/feriados'
import { summarizeSeries } from '../collectors/bcra'
import { extractDestination, finalizeDiscoveries, positionWeight, registerSuggestion, type Discovered } from '../collectors/autocomplete'
import { crossNormalize } from '../collectors/serpapi-trends'
import { buildKnown, matchKnownDestination, stripOrigin } from '../collectors/known'
import { countsAsTravelDemand, isTravelQuery } from '../travel-terms'
import { parseRisingValue, scoreRelatedLists } from '../collectors/google-related'
import { processTrending } from '../collectors/trending-now'

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
    expect(s.change7dPct).toBe(2.7)
    expect(s.change30dPct).toBe(10)
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
    expect(extractDestination('mendoza paquetes', '')).toBe('Mendoza')
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
    expect(extractDestination('paquetes despegar', '')).toBeNull()
    expect(extractDestination('viaje a las estrellas', 'viaje a ')).toBeNull()
  })
})

describe('registerSuggestion + finalizeDiscoveries', () => {
  it('descarta lo que nunca apareció detrás de una semilla de lugar, pesa por posición y unifica variantes', () => {
    const discovered = new Map<string, Discovered>()
    registerSuggestion(discovered, 'viaje a cancun todo incluido', 'viaje a ', 'viaje a', 1)
    registerSuggestion(discovered, 'paquetes a cancun', 'paquetes a c', 'paquetes a', 3)
    registerSuggestion(discovered, 'viaje en grupo de personas', 'viaje en grupo ', 'viaje en grupo', 1)
    registerSuggestion(discovered, 'vuelos a curazao', 'vuelos a ', 'vuelos a', 2)
    registerSuggestion(discovered, 'todo incluido curaçao', 'todo incluido ', 'todo incluido', 1)
    registerSuggestion(discovered, 'luna de miel maldivas', 'luna de miel ', 'luna de miel', 5)

    const signals = finalizeDiscoveries(discovered)
    expect(signals.get('cancun')).toMatchObject({ rawScore: 1.8, normalizedScore: 95, metadata: { name: 'Cancún', mentions: 2, placeMentions: 2 } })
    expect(signals.get('curacao')).toMatchObject({ rawScore: 1.9, normalizedScore: 100, metadata: { name: 'Curaçao', placeMentions: 1 } })
    expect(signals.has('personas')).toBe(false)
    expect(signals.get('maldivas')).toMatchObject({ metadata: { placeMentions: 0 } }) // semilla: entra igual
    expect(positionWeight(1)).toBe(1)
    expect(positionWeight(10)).toBe(0.1)
  })

  it('en modo conocido (YouTube) sólo pasan destinos ya conocidos', () => {
    const discovered = new Map<string, Discovered>()
    registerSuggestion(discovered, 'viaje a la luna', 'viaje a ', 'viaje a', 1)
    registerSuggestion(discovered, 'viaje a japon', 'viaje a ', 'viaje a', 2)
    registerSuggestion(discovered, 'viaje a villa traful', 'viaje a ', 'viaje a', 3)
    const signals = finalizeDiscoveries(discovered, buildKnown())
    expect([...signals.keys()]).toEqual(['japon'])
  })
})

describe('matchKnownDestination', () => {
  const known = buildKnown(new Map([['villa-traful', 'Villa Traful']]))
  it('reconoce destinos y variantes dentro de un texto', () => {
    expect(matchKnownDestination('paquetes a florianopolis 2026', known)).toBe('florianopolis')
    expect(matchKnownDestination('vuelos a curazao baratos', known)).toBe('curacao')
    expect(matchKnownDestination('paquetes a brasil desde córdoba', known)).toBe('brasil')
    expect(matchKnownDestination('villa traful', known)).toBe('villa-traful')
    expect(matchKnownDestination('oca seguimiento de paquetes', known)).toBeNull()
    expect(matchKnownDestination('rio cuarto', known)).toBeNull()
  })

  it('lo que sigue a "desde" o "cerca de" es origen, no destino', () => {
    expect(stripOrigin('vuelos a buenos aires desde tucuman')).toBe('vuelos a buenos aires')
    expect(matchKnownDestination('vuelos a buenos aires desde tucuman', known)).toBeNull()
    expect(matchKnownDestination('paquetes turisticos desde rosario', known)).toBeNull()
    expect(matchKnownDestination('escapadas cerca de rosario', known)).toBeNull()
    expect(matchKnownDestination('paquetes a brasil desde córdoba', known)).toBe('brasil')
  })
})

describe('travel-terms', () => {
  it('distingue viajes de liquidaciones de vacaciones y agencias', () => {
    expect(isTravelQuery('calculo vacaciones no gozadas por renuncia')).toBe(false)
    expect(isTravelQuery('travel sale 2026')).toBe(true)
    expect(isTravelQuery('arajet')).toBe(true)
    expect(countsAsTravelDemand('nuestra señora de la asuncion', 'asuncion')).toBe(false)
    expect(countsAsTravelDemand('villa traful', 'villa-traful')).toBe(true)
    expect(countsAsTravelDemand('punta cana 2027', 'punta-cana')).toBe(true)
    expect(countsAsTravelDemand('la habana', 'la-habana')).toBe(true)
    expect(countsAsTravelDemand('paquetes a florianopolis 2026', 'florianopolis')).toBe(true)
    expect(countsAsTravelDemand('mendoza paquetes', null)).toBe(false)
  })
})

describe('scoreRelatedLists', () => {
  it('toma el top más alto y suma el empuje de las que están en alza', () => {
    const signals = scoreRelatedLists([
      { seed: 'paquetes', rising: [{ query: 'paquetes a florianopolis 2026', value: 'Aumento puntual', slug: 'florianopolis' }, { query: 'msc cruceros', value: '+3.800 %', slug: null }], top: [{ query: 'paquetes brasil', value: 83, slug: 'brasil' }, { query: 'punta cana', value: 23, slug: 'punta-cana' }] },
      { seed: 'vuelos', rising: [{ query: 'vuelos a brasil', value: '+150 %', slug: 'brasil' }], top: [{ query: 'vuelos a brasil', value: 40, slug: 'brasil' }] },
    ])
    expect(signals.get('brasil')).toMatchObject({ normalizedScore: 98, metadata: { topValue: 83, risingBoost: 15 } })
    expect(signals.get('florianopolis')).toMatchObject({ normalizedScore: 40 })
    expect(signals.get('punta-cana')?.normalizedScore).toBe(23)
    expect(parseRisingValue('+3.800 %')).toBe(3800)
    expect(parseRisingValue('Aumento puntual')).toBeNull()
  })
})

describe('processTrending', () => {
  it('se queda con viajes y con temas que nombran un destino, en escala logarítmica', () => {
    const known = buildKnown()
    const { items, destinations } = processTrending([
      { query: 'boca juniors - são paulo', search_volume: 200000, categories: [{ id: 17, name: 'Sports' }] },
      { query: 'aerolineas argentinas paro', search_volume: 20000, categories: [{ id: 19, name: 'Travel and Transportation' }] },
      { query: 'temporal en bariloche', search_volume: 5000, categories: [{ id: 20, name: 'Climate' }] },
      { query: 'vuelos a salta', search_volume: 2000, categories: [{ id: 19, name: 'Travel and Transportation' }] },
      { query: 'gimnasia y esgrima - boca juniors', search_volume: 500000, categories: [{ id: 17, name: 'Sports' }], trend_breakdown: ['gimnasia de mendoza'] },
      { query: 'mirtha legrand', search_volume: 100000, categories: [{ id: 4, name: 'Entertainment' }] },
    ], known)
    expect(items.map(i => i.query)).toEqual(['aerolineas argentinas paro', 'temporal en bariloche', 'vuelos a salta'])
    // Un temporal se muestra pero no suma al score; un partido ni se muestra.
    expect(destinations.has('bariloche')).toBe(false)
    expect(destinations.has('mendoza')).toBe(false)
    expect(destinations.get('salta')).toMatchObject({ rawScore: 2000, normalizedScore: 100 })
  })
})

describe('crossNormalize', () => {
  it('reescala cada grupo para que el ancla valga lo mismo que en el primero', () => {
    const batches = [
      [{ slug: 'brasil', name: 'Brasil', score: 100 }, { slug: 'bariloche', name: 'Bariloche', score: 40 }],
      [{ slug: 'brasil', name: 'Brasil', score: 50 }, { slug: 'aruba', name: 'Aruba', score: 20 }, { slug: 'salta', name: 'Salta', score: 60 }],
    ]
    const n = crossNormalize(batches, 'brasil')
    expect(n.get('brasil')).toMatchObject({ score: 100, batch: 1, factor: 1 })
    expect(n.get('bariloche')).toMatchObject({ score: 40, batch: 1 })
    expect(n.get('aruba')).toMatchObject({ score: 40, batch: 2, factor: 2, comparable: true })
    expect(n.get('salta')?.score).toBe(100)
  })

  it('si el ancla no tiene datos en un grupo, ese grupo queda sin reescalar y marcado', () => {
    const n = crossNormalize([
      [{ slug: 'brasil', name: 'Brasil', score: 80 }],
      [{ slug: 'brasil', name: 'Brasil', score: 0 }, { slug: 'aruba', name: 'Aruba', score: 30 }],
    ], 'brasil')
    expect(n.get('aruba')).toMatchObject({ score: 30, comparable: false, factor: 1 })
  })
})
