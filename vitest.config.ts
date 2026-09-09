import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Sólo funciones puras que deciden plata o control del loop: reglas,
// validadores, parsers, ventanas. Sin React, sin Supabase, sin red.
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'node',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
