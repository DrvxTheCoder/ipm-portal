"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { motion } from "motion/react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Home09Icon, Loading03Icon, Ticket02Icon, UserGroupIcon, UserCircleIcon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"
import { useStore } from "@/lib/store"
import { useOnline } from "@/lib/pwa"
import { LoadFailed, OfflineBanner, StaleBanner } from "@/components/portal/offline"

const NAV = [
  { href: "/", label: "Accueil", icon: Home09Icon },
  { href: "/bons", label: "Mes bons", icon: Ticket02Icon },
  { href: "/famille", label: "Famille", icon: UserGroupIcon },
  { href: "/profil", label: "Profil", icon: UserCircleIcon },
] as const

/** Shortest time the loading screen stays up, so it never just flashes. */
const SPLASH_MIN_MS = 600

/** True while `active`, and until at least `ms` after it became true. */
function useAtLeast(active: boolean, ms: number): boolean {
  const [since, setSince] = useState<number | null>(null)
  useEffect(() => {
    if (active) {
      setSince((s) => s ?? Date.now())
      return
    }
    if (since === null) return
    const timer = setTimeout(() => setSince(null), Math.max(0, since + ms - Date.now()))
    return () => clearTimeout(timer)
  }, [active, ms, since])
  return active || (since !== null && Date.now() - since < ms)
}

/** Shown while the first snapshot loads, typically right after signing in. */
function Splash() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      role="status"
      aria-live="polite"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6"
    >
      <Image src="/brand/ipm-tawfeikh.png" alt="IPM Tawfeikh" width={590} height={371} priority className="h-auto w-40" />
      {/* Reduced motion: no spinner, the line only fades. */}
      <HugeiconsIcon icon={Loading03Icon} className="size-7 text-teal motion-safe:animate-spin motion-reduce:hidden" />
      <p className="font-medium text-ink-2 motion-reduce:animate-pulse">Chargement de votre espace…</p>
    </motion.div>
  )
}

/** Phone-width column, session guard, four labelled tabs. */
export function AppShell({ children }: { children: ReactNode }) {
  const { ready, loaded, session, stale, error, refreshing, refresh } = useStore()
  const pathname = usePathname()
  const router = useRouter()
  // The tabs show only on the four tab screens. Everything else (a bon, the
  // card, the creation flow) is a level down and has its own back button.
  const showNav = NAV.some((item) => item.href === pathname)
  const online = useOnline()
  // Not while a cached snapshot is painted at once: only when there is none yet.
  const splash = useAtLeast(ready && !!session && !loaded && !error, SPLASH_MIN_MS)

  useEffect(() => {
    if (ready && !session) router.replace("/connexion")
  }, [ready, session, router])

  if (!ready || !session) {
    return <div className="mx-auto min-h-dvh max-w-md bg-paper" aria-busy />
  }

  // Pages read the snapshot without guards: render them only once there is one.
  if (!loaded || splash) {
    return (
      <div className="mx-auto min-h-dvh max-w-md bg-paper" aria-busy={!error}>
        {splash ? <Splash /> : error && <LoadFailed message={error} refreshing={refreshing} onRetry={() => void refresh()} />}
      </div>
    )
  }

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-paper md:my-6 md:min-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-[2.2rem] md:border md:border-line md:shadow-[0_30px_80px_-40px_rgba(13,42,48,.45)]">
      <main
        className={cn(
          "relative",
          showNav ? "pb-28" : !pathname.startsWith("/bons/nouveau") && "pb-[max(env(safe-area-inset-bottom),24px)]"
        )}
      >
        {children}
      </main>
      {/* The creation flow has its own, blocking notice. */}
      {!online && !pathname.startsWith("/bons/nouveau") && <OfflineBanner aboveNav={showNav} />}
      {online && stale && !pathname.startsWith("/bons/nouveau") && (
        <StaleBanner aboveNav={showNav} refreshing={refreshing} onRetry={() => void refresh()} />
      )}
      {showNav && (
        <nav
          aria-label="Navigation principale"
          className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-md px-4 pb-[max(env(safe-area-inset-bottom),12px)]"
        >
          <ul className="grid grid-cols-4 rounded-2xl border border-line bg-surface/95 p-1.5 shadow-[0_10px_30px_-12px_rgba(13,42,48,.35)] backdrop-blur">
            {NAV.map((item) => {
              const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-xl py-2 text-[0.72rem] font-medium text-ink-3 transition-colors",
                      active && "bg-mint-wash text-teal-deep"
                    )}
                  >
                    <HugeiconsIcon icon={item.icon} className="size-6" strokeWidth={active ? 2 : 1.6} />
                    {item.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
      )}
    </div>
  )
}

export function PageHeader({ title, back, action }: { title: string; back?: string; action?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-2 bg-paper/90 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3 backdrop-blur">
      {back && <BackLink href={back} />}
      <h1 className="figure flex-1 text-[1.9rem] font-bold text-ink">{title}</h1>
      {action}
    </header>
  )
}

export function BackLink({ href, onClick }: { href?: string; onClick?: () => void }) {
  const icon = (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
  const cls = "inline-flex size-11 items-center justify-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line"
  if (onClick)
    return (
      <button type="button" onClick={onClick} aria-label="Retour" className={cls}>
        {icon}
      </button>
    )
  return (
    <Link href={href ?? "/"} aria-label="Retour" className={cls}>
      {icon}
    </Link>
  )
}
