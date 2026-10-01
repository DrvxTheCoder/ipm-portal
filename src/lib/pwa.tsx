"use client"

import { useEffect, useSyncExternalStore } from "react"

/**
 * Registers public/sw.js, in production only: in dev, Turbopack's chunks change
 * on every edit and a caching worker would serve yesterday's code.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return
    navigator.serviceWorker
      .register(`/sw.js?v=${process.env.NEXT_PUBLIC_BUILD_ID ?? "dev"}`, { scope: "/", updateViaCache: "none" })
      .catch(() => {
        // No worker, no offline mode — the app itself still works online.
      })
  }, [])
  return null
}

function subscribe(onChange: () => void) {
  window.addEventListener("online", onChange)
  window.addEventListener("offline", onChange)
  return () => {
    window.removeEventListener("online", onChange)
    window.removeEventListener("offline", onChange)
  }
}

/** `navigator.onLine`, live. Assumed online during server rendering. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true
  )
}
