"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { File01Icon, RefreshIcon, LinkSquare02Icon } from "@hugeicons/core-free-icons"
import { viaApi } from "@/lib/api"
import { cn } from "@/lib/utils"

/**
 * L'ordonnance — medical data.
 *
 * `src` is the signed link the API mints for a caller already allowed to read
 * the file, valid ten minutes; the response is `private, no-store`, and the
 * service worker never touches `/api/*`. Nothing here keeps a copy: no blob,
 * no storage. Referrer off, so the signed URL does not leak to another site.
 *
 * When the image does not load — the link lapsed, or the file is a PDF an
 * `<img>` cannot show — the box keeps its size and offers to fetch a fresh
 * link (`onRenew`: the snapshot or the bon again) and to open the file.
 */
export function PrescriptionImage({
  src: minted,
  className,
  onRenew,
  renewing = false,
}: {
  /** The signed link as the API gave it. */
  src: string | null
  className?: string
  onRenew?: () => void
  renewing?: boolean
}) {
  const [failed, setFailed] = useState<string | null>(null)
  const src = viaApi(minted)

  if (!src) {
    return (
      <div className={cn("grid place-items-center gap-2 bg-sunken p-4 text-center text-ink-3", className)}>
        <HugeiconsIcon icon={File01Icon} className="size-8" />
        <p className="text-sm">Aucune ordonnance jointe</p>
      </div>
    )
  }

  if (failed === src) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 bg-sunken p-4 text-center", className)}>
        <HugeiconsIcon icon={File01Icon} className="size-8 text-ink-3" />
        <p className="text-sm text-ink-2">L&apos;ordonnance ne s&apos;affiche pas ici (lien expiré ou document PDF).</p>
        <div className="flex flex-wrap justify-center gap-2">
          {onRenew && (
            <button
              type="button"
              onClick={onRenew}
              disabled={renewing}
              className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-teal ring-1 ring-line disabled:opacity-60"
            >
              <HugeiconsIcon icon={RefreshIcon} className={cn("size-4", renewing && "animate-spin")} />
              Recharger
            </button>
          )}
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            referrerPolicy="no-referrer"
            className="inline-flex h-10 items-center gap-1.5 rounded-full bg-surface px-4 text-sm font-semibold text-teal ring-1 ring-line"
          >
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-4" />
            Ouvrir
          </a>
        </div>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="Ordonnance"
      referrerPolicy="no-referrer"
      draggable={false}
      onError={() => setFailed(src)}
      className={cn("bg-sunken object-contain", className)}
    />
  )
}
