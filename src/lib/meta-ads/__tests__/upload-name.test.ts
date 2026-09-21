import { describe, expect, it } from 'vitest'
import { metaUploadFileName } from '../creative-uploader'

describe('metaUploadFileName', () => {
  it('deja el nombre si ya tiene extensión', () => {
    expect(metaUploadFileName('4x5.mp4', 'video/mp4', 'VIDEO')).toBe('4x5.mp4')
    expect(metaUploadFileName('portada.JPG', 'image/jpeg', 'IMAGE')).toBe('portada.JPG')
  })
  it('agrega la extensión según el tipo cuando falta (caso Drive "4x5")', () => {
    expect(metaUploadFileName('4x5', 'video/mp4', 'VIDEO')).toBe('4x5.mp4')
    expect(metaUploadFileName('9x16', 'video/quicktime', 'VIDEO')).toBe('9x16.mov')
    expect(metaUploadFileName('4x5', 'image/jpeg', 'IMAGE')).toBe('4x5.jpg')
    expect(metaUploadFileName('9x16', 'image/png', 'IMAGE')).toBe('9x16.png')
  })
  it('sin mime asume mp4 o jpg', () => {
    expect(metaUploadFileName('clip', null, 'VIDEO')).toBe('clip.mp4')
    expect(metaUploadFileName('', undefined, 'IMAGE')).toBe('image.jpg')
  })
})
