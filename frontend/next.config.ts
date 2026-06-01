import type { NextConfig } from "next";

/**
 * The forum backend (the Requesting server) runs separately. The browser bundle
 * never hardcodes its origin: the client always talks to a same-origin `/api/*`
 * path, and Next rewrites that to the backend. Override with `BACKEND_ORIGIN`.
 */
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  // The type-safe SDK and inferred `ForumApi` contract live in the backend
  // workspace (`../src`). `externalDir` lets the Next compiler transpile those
  // TypeScript sources even though they sit outside the frontend root, so the
  // frontend consumes the real SDK instead of a hand-copied fork.
  experimental: {
    externalDir: true,
  },
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${BACKEND_ORIGIN}/api/:path*` },
    ];
  },
};

export default nextConfig;
