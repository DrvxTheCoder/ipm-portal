/**
 * Service worker — the portal works offline, except creating a bon.
 *
 * No build plugin: Serwist (what the Next.js guide suggests) needs webpack and
 * this app builds with Turbopack. So the precache list is discovered instead
 * of generated: on install, every screen is fetched, and every asset its HTML
 * and CSS reference is cached with it — scripts, styles, fonts, images.
 *
 * Why that is enough: the data lives in localStorage (see lib/store), and
 * every screen's server HTML is the same empty shell that waits for the store.
 * So one cached copy of a route serves it for any data — `/bons/~` stands in
 * for every bon, including ones created after this worker was installed.
 *
 * Versioning: the page registers `/sw.js?v=<build id>`. A new deploy changes
 * the URL, which installs a fresh worker; it precaches the new build and drops
 * the previous build's cache on activation.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev"
const CACHE = `ipm-portail-${VERSION}`

/** Every screen. `/bons/~` is the shell for any `/bons/<id>`. */
const ROUTES = ["/", "/bons", "/bons/~", "/bons/nouveau", "/famille", "/profil", "/carte", "/consommation", "/prestataires", "/connexion"]
const BON_SHELL = "/bons/~"

const STATIC = [
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/maskable-192.png",
  "/icons/maskable-512.png",
  "/brand/ipm-tawfeikh.png",
]

/** Same-origin URLs an HTML page or a stylesheet refers to. */
function referencedUrls(text, base) {
  const found = new Set()
  const patterns = [
    /(?:href|src)="([^"]+)"/g,
    /srcSet="([^"]+)"/gi,
    /url\(\s*['"]?([^'")]+)['"]?\s*\)/g,
    // Chunk paths inside the inlined RSC payload, often JSON-escaped.
    /(\/_next\/static\/[^"'\s\\)]+)/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      for (const candidate of match[1].split(",")) {
        const raw = candidate.trim().split(/\s+/)[0].replace(/&amp;/g, "&")
        if (!raw || raw.startsWith("data:") || raw.startsWith("#")) continue
        try {
          const url = new URL(raw, base)
          if (url.origin === self.location.origin) found.add(url.pathname + url.search)
        } catch {
          // Not a URL — skip it.
        }
      }
    }
  }
  return found
}

async function precache() {
  const cache = await caches.open(CACHE)
  const assets = new Set(STATIC)

  await Promise.allSettled(
    ROUTES.map(async (route) => {
      const response = await fetch(route, { cache: "reload", credentials: "same-origin" })
      if (!response.ok) return
      await cache.put(route, response.clone())
      for (const url of referencedUrls(await response.text(), self.location.origin + route)) assets.add(url)
    })
  )

  // Stylesheets name the font files; fetch them first to find those.
  const styles = [...assets].filter((url) => url.split("?")[0].endsWith(".css"))
  await Promise.allSettled(
    styles.map(async (url) => {
      const response = await fetch(url, { cache: "reload" })
      if (!response.ok) return
      await cache.put(url, response.clone())
      for (const ref of referencedUrls(await response.text(), self.location.origin + url)) assets.add(ref)
    })
  )

  const rest = [...assets].filter((url) => !styles.includes(url) && !ROUTES.includes(url) && !url.startsWith("/api/"))
  await Promise.allSettled(rest.map((url) => cache.add(new Request(url, { cache: "reload" }))))
}

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => key.startsWith("ipm-portail-") && key !== CACHE).map((key) => caches.delete(key)))
      await self.clients.claim()
    })()
  )
})

/** Pages: network first, so an online visit always sees the latest build. */
async function navigate(request) {
  const url = new URL(request.url)
  const cache = await caches.open(CACHE)
  try {
    const response = await fetch(request)
    if (response.ok && response.type === "basic") cache.put(url.pathname, response.clone())
    return response
  } catch {
    const cached =
      (await cache.match(url.pathname)) ??
      (url.pathname.startsWith("/bons/") ? await cache.match(BON_SHELL) : undefined) ??
      (await cache.match("/"))
    return cached ?? new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } })
  }
}

/** Build output is content-hashed: once cached, never stale. */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

/** Icons, images, manifest: serve the cached copy, refresh it in the background. */
async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE)
  const cached = await cache.match(request)
  const refresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => cached)
  if (cached) {
    event.waitUntil(refresh)
    return cached
  }
  return refresh
}

self.addEventListener("fetch", (event) => {
  const { request } = event
  if (request.method !== "GET") return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Reading a receipt needs the server; never answer it from a cache.
  if (url.pathname.startsWith("/api/")) return

  // RSC payloads for client-side navigation. Offline, letting the fetch fail
  // makes the router fall back to a full page load — served from the cache.
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return

  if (request.mode === "navigate") {
    event.respondWith(navigate(request))
    return
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request))
    return
  }
  event.respondWith(staleWhileRevalidate(request, event))
})
