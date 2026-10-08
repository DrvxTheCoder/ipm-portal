"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useEffect, useState, type ReactNode } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Loading03Icon, Logout01Icon } from "@hugeicons/core-free-icons"
import { usePrestataire } from "@/lib/prestataire/session"
import { guardRedirect } from "@/domain/prestataire/pharmacy"
import { useOnline } from "@/lib/pwa"
import { cn } from "@/lib/utils"

/**
 * Phone-width column and the session guard for `/prestataire/*`. Renders a
 * page only where `guardRedirect` lets it stay, so a signed-out visitor never
 * sees a pharmacy screen flash, and a temporary password reaches nothing but
 * its change.
 */
export function PrestataireShell({ children }: { children: ReactNode }) {
  const { ready, session } = usePrestataire()
  const pathname = usePathname()
  const router = useRouter()
  const online = useOnline()
  const target = ready ? guardRedirect(session, pathname) : null

  useEffect(() => {
    if (target) router.replace(target)
  }, [target, router])

  return (
    <div className="mx-auto min-h-dvh max-w-md bg-paper md:my-6 md:min-h-[calc(100dvh-3rem)] md:overflow-hidden md:rounded-[2.2rem] md:border md:border-line md:shadow-[0_30px_80px_-40px_rgba(13,42,48,.45)]">
      {!ready || target ? (
        <div className="min-h-dvh" aria-busy />
      ) : (
        <>
          {!online && (
            <p role="status" className="sticky top-0 z-30 bg-amber-tint px-4 py-2 text-center text-sm font-medium text-amber">
              Hors connexion : la validation des bons nécessite internet.
            </p>
          )}
          <main className="pb-[max(env(safe-area-inset-bottom),24px)]">{children}</main>
        </>
      )}
    </div>
  )
}

/** The pharmacy's name and the logout, on every signed-in screen. */
export function PrestataireHeader({ title, back }: { title?: string; back?: string }) {
  const { session, signOut } = usePrestataire()
  const router = useRouter()
  const [leaving, setLeaving] = useState(false)

  async function logout() {
    setLeaving(true)
    await signOut()
    router.replace("/prestataire/connexion")
  }

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 bg-paper/90 px-4 pt-[max(env(safe-area-inset-top),14px)] pb-3 backdrop-blur">
      {back && (
        <Link
          href={back}
          aria-label="Retour"
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink shadow-sm ring-1 ring-line"
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </Link>
      )}
      {/* <Image src="/brand/ipm-tawfeikh.png" alt="IPM Tawfeikh" width={590} height={371} className="h-auto w-14 shrink-0" /> */}
      <div className="min-w-0 flex-1">
        {title ? (
          <h1 className="figure truncate text-[1.7rem] leading-tight font-bold">{title}</h1>
        ) : (
          <>
            <p className="text-sm text-ink-3">Espace pharmacie</p>
            <p className="truncate font-semibold">{session?.provider.name}</p>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        disabled={leaving}
        aria-label="Se déconnecter"
        className={cn(
          "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface px-3.5 text-sm font-semibold text-ink-2 ring-1 ring-line",
          leaving && "opacity-60"
        )}
      >
        <HugeiconsIcon icon={leaving ? Loading03Icon : Logout01Icon} className={cn("size-5", leaving && "animate-spin")} />
        {/* <span className="hidden min-[380px]:inline">Déconnexion</span> */}
      </button>
    </header>
  )
}
