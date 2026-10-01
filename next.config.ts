import type { NextConfig } from "next"

/**
 * One id per build, shared with the page: it registers `/sw.js?v=<id>`, so a
 * new deploy installs a new service worker that precaches the new build.
 */
const buildId = process.env.BUILD_ID ?? new Date().toISOString().replace(/\D/g, "").slice(0, 14)

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  generateBuildId: async () => buildId,
  env: { NEXT_PUBLIC_BUILD_ID: buildId },
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
}

export default nextConfig
