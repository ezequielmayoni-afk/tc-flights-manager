import type { NextConfig } from 'next'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))

const nextConfig: NextConfig = {
  // Esta app vive dentro del monorepo `hub`; fijamos el root para que Turbopack
  // no escanee archivos del hub padre (había tomado su middleware).
  turbopack: { root: here },
  outputFileTracingRoot: here,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'media.p1travel.com' },
      { protocol: 'https', hostname: 'ik.imagekit.io' },
      { protocol: 'https', hostname: 'cms.p1travel.com' },
      { protocol: 'https', hostname: 'static.p1travel.com' },
      { protocol: 'https', hostname: '**.amazonaws.com' },
      { protocol: 'https', hostname: '**.supabase.co' },
    ],
  },
}

export default nextConfig
