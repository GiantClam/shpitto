import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  outputFileTracingIncludes: {
    '/docs/**': ['./content/docs/v1/**/*'],
  },
  experimental: {
    externalDir: false,
  },
};

export default nextConfig;
