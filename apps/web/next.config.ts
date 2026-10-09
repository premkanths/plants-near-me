import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Note: `/api/*` is handled by the route handlers in src/app/api (the BFF proxy
  // in src/app/api/[...path]/route.ts), which inject the access token from the
  // httpOnly cookie. The browser therefore only ever talks to this origin.
  allowedDevOrigins: ['*.e2b.app', '*.app.github.dev', '*.gitpod.io'],
};

export default nextConfig;
