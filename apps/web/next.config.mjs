import path from 'node:path';

// Standalone output is only needed for the Docker build (it produces
// `.next/standalone/server.js`). It's opt-in via BUILD_STANDALONE=1 because
// it requires symlink privileges that Windows doesn't grant by default,
// which would break local `pnpm build` on dev machines.
const standalone = process.env.BUILD_STANDALONE === '1';

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typedRoutes: true,
  transpilePackages: ['@dv-wms/types'],
  ...(standalone ? { output: 'standalone' } : {}),
  // Trace from the repo root so the standalone build picks up @dv-wms/types
  // from packages/. Harmless when standalone is off.
  outputFileTracingRoot: path.join(process.cwd(), '..', '..'),
  async rewrites() {
    const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001/api/v1';
    return [
      {
        source: '/api/proxy/:path*',
        destination: `${apiBase}/:path*`,
      },
    ];
  },
};

export default nextConfig;
