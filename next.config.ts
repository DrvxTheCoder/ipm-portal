import type { NextConfig } from "next"

/**
 * One id per build, shared with the page: it registers `/sw.js?v=<id>`, so a
 * new deploy installs a new service worker that precaches the new build.
 */
const buildId = process.env.BUILD_ID ?? new Date().toISOString().replace(/\D/g, "").slice(0, 14)

/**
 * Where multiapp listens, as this server sees it. The browser never calls it
 * directly: it calls `/api/portail/*` on whatever address it opened the
 * portal on (localhost, a LAN IP from a phone, the production domain), and
 * this server forwards. One origin, so no CORS, and a phone on the same
 * network works without knowing where multiapp is.
 */
const apiTarget = process.env.API_PROXY_TARGET?.replace(/\/$/, "")
if (!apiTarget) {
  throw new Error("API_PROXY_TARGET is not set: add multiapp's URL to .env (see .env.example).")
}

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
  async rewrites() {
    return [{ source: "/api/portail/:path*", destination: `${apiTarget}/api/portail/:path*` }]
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          // The browser must always see the current worker script.
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ]
  },
  allowedDevOrigins: ['10.0.0.79'],
}

export default nextConfig
