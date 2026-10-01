"use client"

import Link from "next/link"
import { HugeiconsIcon } from "@hugeicons/react"
import { WifiOff01Icon } from "@hugeicons/core-free-icons"
import { cn } from "@/lib/utils"

/**
 * Shown on every screen while offline, floating above the tab bar (or the
 * bottom edge when there is none), so it never collides with a sticky header.
 */
export function OfflineBanner({ aboveNav }: { aboveNav: boolean }) {
  return (
    <div
      role="status"
      className={cn(
        "pointer-events-none fixed inset-x-0 z-30 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm text-white shadow-lg",
        aboveNav ? "bottom-[calc(max(env(safe-area-inset-bottom),12px)+5.25rem)]" : "bottom-[max(env(safe-area-inset-bottom),16px)]"
      )}
    >
      <HugeiconsIcon icon={WifiOff01Icon} className="size-4 shrink-0" />
      <span>Hors ligne · consultation seulement</span>
    </div>
  )
}

/** Covers the creation flow while offline; the draft underneath is kept. */
export function OfflineNotice() {
  return (
    <div className="fixed inset-0 z-40 mx-auto flex max-w-md items-center justify-center bg-paper/85 px-6 backdrop-blur-sm">
      <div role="alertdialog" aria-labelledby="offline-title" className="w-full rounded-3xl bg-surface p-6 text-center ring-1 ring-line">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-amber-tint text-amber">
          <HugeiconsIcon icon={WifiOff01Icon} className="size-7" />
        </span>
        <h2 id="offline-title" className="figure mt-4 text-2xl font-bold">Connexion requise</h2>
        <p className="mt-2 text-ink-2">
          Créer un bon demande une connexion internet : l&apos;IPM doit le valider avant que le prestataire puisse le
          scanner. Restez sur cette page : votre saisie sera conservée jusqu&apos;au retour de la connexion.
        </p>
        <Link href="/" className="mt-5 inline-flex h-12 w-full items-center justify-center rounded-2xl bg-teal font-semibold text-white">
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  )
}
