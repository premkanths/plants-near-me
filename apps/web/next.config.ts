import type { NextConfig } from 'next';

const apiBaseUrl = process.env.API_BASE_URL ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // The browser must never talk to the API host directly (it may be private, and in
  // sandboxes/previews "localhost" is not the user's machine). Everything goes through
  // this same-origin proxy instead.
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${apiBaseUrl}/api/:path*` }];
  },
  // Allow the hosted preview origins to load Next.js dev assets.
  allowedDevOrigins: ['*.e2b.app', '*.app.github.dev', '*.gitpod.io'],
};

export default nextConfig;
