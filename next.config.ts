import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'tr2storage.blob.core.windows.net',
      },
      {
        protocol: 'https',
        hostname: 'static.travelconline.com',
      },
    ],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: '500mb',
    },
    middlewareClientMaxBodySize: '500mb',
  },
};

export default nextConfig;
