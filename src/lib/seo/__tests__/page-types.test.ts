import { describe, expect, it } from 'vitest'
import { classifyPage, ideaIdFromUrl } from '../page-types'

describe('classifyPage', () => {
  it('clasifica las plantillas de siviajo.com', () => {
    expect(classifyPage('https://www.siviajo.com/')).toBe('home')
    expect(classifyPage('https://siviajo.com/es/')).toBe('home')
    expect(classifyPage('https://www.siviajo.com/home')).toBe('home')
    expect(classifyPage('https://www.siviajo.com/es/idea/39635286/paquete-f1-gp-san-pablo')).toBe('idea')
    expect(classifyPage('https://siviajo.com/es/idea/39635286/paquete')).toBe('idea')
    expect(classifyPage('https://www.siviajo.com/es/26/caribe/moreideas')).toBe('theme')
    expect(classifyPage('https://www.siviajo.com/es/moreideas')).toBe('theme')
    expect(classifyPage('https://www.siviajo.com/es/theme/44739/si-viajo-la-agencia')).toBe('theme')
    expect(classifyPage('https://www.siviajo.com/es/destination/cun')).toBe('destination')
    expect(classifyPage('https://www.siviajo.com/es/landing/31706/burgerpalusa-2026')).toBe('landing')
    expect(classifyPage('https://www.siviajo.com/es/holidays/availability')).toBe('other')
  })

  it('separa los otros hosts del dominio', () => {
    expect(classifyPage('https://blog.siviajo.com/mejor-epoca-para-viajar-a-bayahibe/')).toBe('blog')
    expect(classifyPage('https://vuelos.siviajo.com/vuelos-baratos/miami')).toBe('vuelos')
    expect(classifyPage('https://hub.siviajo.com/vuelos-baratos')).toBe('vuelos')
    expect(classifyPage('https://institucional.siviajo.com/institucional.html')).toBe('institucional')
    expect(classifyPage('https://sports.siviajo.com/')).toBe('other')
    expect(classifyPage('basura')).toBe('other')
  })
})

describe('ideaIdFromUrl', () => {
  it('saca el id de TC de la ficha', () => {
    expect(ideaIdFromUrl('https://www.siviajo.com/es/idea/44495922/paquete-formula-1')).toBe(44495922)
    expect(ideaIdFromUrl('https://www.siviajo.com/es/26/caribe/moreideas')).toBeNull()
  })
})
