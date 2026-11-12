import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  // No next/image: keeps the platform-specific sharp/@img binaries out of the cross-platform bundle.
  images: { unoptimized: true },
  outputFileTracingRoot: import.meta.dirname,
  outputFileTracingExcludes: {
    '*': ['src/**', 'tests/**', 'scripts/**', 'data/**', 'docs/**', 'node_modules/sharp/**', 'node_modules/@img/**', 'node_modules/typescript/**', 'node_modules/@swc/core*/**'],
  },
};

export default config;
